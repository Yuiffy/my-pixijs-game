"use client";

import { Ball, Box, Cyl, Figure, Floor, Hot, PortraitBillboard, Sign, Window, useCanvasTexture } from "./kit";
import type { Season } from "../lines";

/* eslint-disable react/no-unused-prop-types -- 室内场景共用一份属性，每个场景只取其中一部分 */
export interface IndoorProps {
  season: Season;
  portrait: string | null;
  night: boolean;
  parenthood?: boolean;
  meeting?: boolean;
  month?: number;
  speaker?: number;
}
/* eslint-enable react/no-unused-prop-types */

const WINDOW_SKY = { day: "#9cc7e8", night: "#1c2744" };

function Walls({ width, depth, height = 2.8, color }: { width: number; depth: number; height?: number; color: string }) {
  return (
    <>
      <Box position={[0, height / 2, -depth / 2 - 0.05]} size={[width, height, 0.1]} color={color} />
      <Box position={[-width / 2 - 0.05, height / 2, 0]} size={[0.1, height, depth]} color={color} />
      <Box position={[width / 2 + 0.05, height / 2, 0]} size={[0.1, height, depth]} color={color} />
    </>
  );
}

function Plant({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      <Cyl position={[0, 0.16, 0]} radius={0.15} top={0.18} height={0.32} color="#b86b45" />
      <Ball position={[0, 0.5, 0]} radius={0.24} color="#4f8a55" />
      <Ball position={[0.12, 0.68, 0.05]} radius={0.16} color="#5f9c61" />
    </group>
  );
}

function Screen({ position, size, lines, accent }: { position: [number, number, number]; size: [number, number]; lines: string[]; accent: string }) {
  const texture = useCanvasTexture(`screen-${lines.join("|")}-${accent}`, (context, width, height) => {
    context.fillStyle = "#16202c";
    context.fillRect(0, 0, width, height);
    context.fillStyle = accent;
    context.fillRect(0, 0, width, 16);
    context.font = "600 15px monospace";
    lines.forEach((line, index) => {
      context.fillStyle = index % 3 === 0 ? "#8fd3ff" : index % 3 === 1 ? "#d8e2ea" : "#f0c674";
      context.fillText(line, 12, 36 + index * 18);
    });
  }, 256, 160);
  return (
    <mesh position={position}>
      <planeGeometry args={size} />
      <meshStandardMaterial map={texture} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.85} />
    </mesh>
  );
}

// 出租屋：镜子衣柜=理发整理，哑铃=运动，书架=学习，电脑=加班，床=休息
export function RoomScene({ night, month = 1 }: IndoorProps) {
  return (
    <group>
      <Floor size={[6, 5]} color="#b99a78" />
      <Walls width={6} depth={5} color="#e6dccb" />
      <Box position={[0, 0.01, 0.4]} size={[2.2, 0.01, 1.6]} color="#8a6f8f" />
      <Window position={[1.3, 1.75, -2.49]} size={[1.3, 0.95]} sky={night ? WINDOW_SKY.night : WINDOW_SKY.day} />
      {night && [0.9, 1.2, 1.55, 1.8].map((x, index) => <Ball key={x} position={[x, 1.5 + (index % 2) * 0.25, -2.47]} radius={0.03} color="#ffd98a" emissive />)}
      <Hot id="bed" marker={[-1.9, 1.05, -1.2]}>
        <Box position={[-1.9, 0.2, -1.3]} size={[1.6, 0.4, 2.2]} color="#8a6446" />
        <Box position={[-1.9, 0.46, -1.3]} size={[1.5, 0.16, 2.1]} color="#f2efe8" />
        <Box position={[-1.9, 0.57, -0.85]} size={[1.52, 0.07, 1.3]} color="#5d7fa8" />
        <Box position={[-1.9, 0.62, -2.1]} size={[0.9, 0.14, 0.36]} color="#fbf8f1" />
      </Hot>
      <Hot id="room-phone" marker={[-1.35, 0.9, -0.55]}>
        <Box position={[-1.35, 0.62, -0.55]} size={[0.1, 0.02, 0.17]} color="#1b1c20" emissive="#5fb0ff" />
      </Hot>
      <group>
        <Box position={[1.9, 0.74, -2.0]} size={[1.6, 0.06, 0.8]} color="#c9a57b" />
        {[[-0.72, -0.34], [0.72, -0.34], [-0.72, 0.34], [0.72, 0.34]].map(([x, z]) => <Box key={`${x}${z}`} position={[1.9 + x, 0.36, -2.0 + z]} size={[0.06, 0.72, 0.06]} color="#8a6446" />)}
        <Box position={[1.9, 0.45, -1.35]} size={[0.5, 0.06, 0.5]} color="#3e3a3f" />
        <Box position={[1.9, 0.75, -1.12]} size={[0.5, 0.6, 0.06]} color="#3e3a3f" />
        <Cyl position={[2.55, 1.0, -2.2]} radius={0.05} height={0.5} color="#2f2f33" />
        <Ball position={[2.55, 1.28, -2.15]} radius={0.1} color="#ffe2a0" emissive />
      </group>
      <Hot id="laptop" marker={[1.9, 1.4, -2.0]}>
        <Box position={[1.9, 0.785, -1.95]} size={[0.52, 0.03, 0.36]} color="#6a6f78" metalness={0.4} />
        <group position={[1.9, 0.96, -2.13]} rotation={[-0.2, 0, 0]}>
          <Box position={[0, 0, -0.015]} size={[0.52, 0.34, 0.02]} color="#6a6f78" />
          <Screen position={[0, 0, 0.001]} size={[0.48, 0.3]} lines={["weekly_report.xlsx", "TODO: 需求 #2087", "明早 9:30 站会", "…"]} accent="#3d6a9c" />
        </group>
      </Hot>
      <Hot id="bill" marker={[1.3, 1.05, -1.8]}>
        <Box position={[1.3, 0.785, -1.82]} size={[0.3, 0.012, 0.2]} color="#efdfb7" />
        <Box position={[1.3, 0.792, -1.82]} size={[0.3, 0.004, 0.04]} color="#c24b4b" />
      </Hot>
      <Hot id="bookshelf" marker={[2.55, 2.25, 0.1]}>
        <Box position={[2.78, 1.0, 0.1]} size={[0.42, 2.0, 1.2]} color="#9a7350" />
        {[0.45, 0.95, 1.45].map(y => [-0.4, -0.2, 0, 0.2, 0.4].map((z, index) => (
          <Box key={`${y}${z}`} position={[2.66, y + 0.14, 0.1 + z]} size={[0.2, 0.3 - (index % 2) * 0.06, 0.14]} color={["#b84a4a", "#3d6a9c", "#e0b24c", "#4f8a55", "#7a6aa8"][index]} />
        )))}
      </Hot>
      <Hot id="mirror" marker={[-2.45, 2.35, 0.6]}>
        <Box position={[-2.75, 1.1, 1.1]} size={[0.5, 2.2, 1.1]} color="#d8cbb4" />
        <Box position={[-2.49, 1.1, 1.1]} size={[0.02, 2.0, 0.02]} color="#8a6446" />
        <Box position={[-2.97, 1.25, 0.15]} size={[0.04, 1.4, 0.55]} color="#bcd4de" metalness={0.6} roughness={0.15} />
      </Hot>
      <Hot id="dumbbell" marker={[-0.4, 0.5, 0.7]}>
        <Cyl position={[-0.4, 0.08, 0.7]} radius={0.025} height={0.5} color="#9aa0a8" rotation={[0, 0, Math.PI / 2]} />
        <Cyl position={[-0.62, 0.08, 0.7]} radius={0.08} height={0.08} color="#2b2c30" rotation={[0, 0, Math.PI / 2]} />
        <Cyl position={[-0.18, 0.08, 0.7]} radius={0.08} height={0.08} color="#2b2c30" rotation={[0, 0, Math.PI / 2]} />
      </Hot>
      <Hot id="calendar" marker={[-0.2, 2.25, -2.4]}>
        <Sign position={[-0.2, 1.75, -2.49]} size={[0.5, 0.62]} text={`${month}月`} background="#c24b4b" font={72} />
      </Hot>
      <Plant position={[0.8, 0, -2.2]} />
    </group>
  );
}

// 婚后的家：伴侣立牌坐在沙发边；育儿阶段多一间儿童房
export function HomeScene({ night, portrait, parenthood, month = 1 }: IndoorProps) {
  return (
    <group>
      <Floor size={[7, 5.5]} color="#c8ab85" />
      <Walls width={7} depth={5.5} color="#efe6d6" />
      <Window position={[0.6, 1.75, -2.74]} size={[1.6, 1.0]} sky={night ? WINDOW_SKY.night : WINDOW_SKY.day} />
      <Hot id="sofa" marker={[-1.8, 1.2, -0.4]}>
        <Box position={[-1.8, 0.28, -0.4]} size={[2.0, 0.4, 0.9]} color="#6d8a7c" />
        <Box position={[-1.8, 0.7, -0.8]} size={[2.0, 0.5, 0.2]} color="#6d8a7c" />
        <Box position={[-2.75, 0.5, -0.4]} size={[0.16, 0.4, 0.9]} color="#5f7a6d" />
        <Box position={[-0.85, 0.5, -0.4]} size={[0.16, 0.4, 0.9]} color="#5f7a6d" />
      </Hot>
      {portrait && <PortraitBillboard image={portrait} position={[-1.4, 0.1, -0.25]} height={1.55} rotation={0.25} />}
      <Hot id="home-phone" marker={[-2.3, 0.85, -0.2]}>
        <Box position={[-2.3, 0.5, -0.2]} size={[0.1, 0.02, 0.17]} color="#1b1c20" emissive="#5fb0ff" />
      </Hot>
      <Hot id="dining" marker={[1.5, 1.35, -0.4]}>
        <Cyl position={[1.5, 0.74, -0.4]} radius={0.7} height={0.05} color="#b88d62" segments={16} />
        <Cyl position={[1.5, 0.37, -0.4]} radius={0.08} height={0.72} color="#8a6446" />
        <Box position={[0.7, 0.45, -0.4]} size={[0.42, 0.06, 0.42]} color="#8a6446" />
        <Box position={[2.3, 0.45, -0.4]} size={[0.42, 0.06, 0.42]} color="#8a6446" />
        <Cyl position={[1.35, 0.8, -0.3]} radius={0.12} height={0.05} color="#f5f1e8" />
        <Cyl position={[1.7, 0.8, -0.5]} radius={0.12} height={0.05} color="#f5f1e8" />
      </Hot>
      <Hot id="bill" marker={[1.9, 1.05, -0.1]}>
        <Box position={[1.9, 0.775, -0.1]} size={[0.28, 0.01, 0.18]} color="#efdfb7" />
      </Hot>
      <Hot id="home-laptop" marker={[3.0, 1.35, -2.3]}>
        <Box position={[3.0, 0.72, -2.3]} size={[0.9, 0.05, 0.6]} color="#c9a57b" />
        <Box position={[3.0, 0.36, -2.3]} size={[0.8, 0.7, 0.5]} color="#a7825e" />
        <Box position={[3.0, 0.92, -2.45]} size={[0.46, 0.3, 0.02]} color="#1b2a3a" emissive="#315a85" />
      </Hot>
      <Hot id="calendar" marker={[3.1, 2.15, 1.3]}>
        <Box position={[3.1, 0.95, 1.3]} size={[0.7, 1.9, 0.7]} color="#e8ecef" metalness={0.3} />
        <Sign position={[2.74, 1.35, 1.3]} size={[0.32, 0.4]} text={`${month}月`} background="#c24b4b" rotation={[0, -Math.PI / 2, 0]} font={72} />
      </Hot>
      {parenthood && (
        <Hot id="kid-room" marker={[-2.6, 2.4, -2.5]}>
          <Box position={[-2.6, 1.05, -2.72]} size={[0.9, 2.1, 0.06]} color="#f2c9a0" />
          <Sign position={[-2.6, 1.7, -2.68]} size={[0.5, 0.2]} text="宝贝的房间" background="#f7e1b5" color="#8a4b3a" font={44} />
          <Figure position={[-2.0, 0, -1.9]} look={{ shirt: "#f0b43c", pants: "#4f7fa8", hair: "#3a2a20" }} scale={0.62} rotation={0.4} />
        </Hot>
      )}
      <Plant position={[0.2, 0, -2.4]} />
      <Box position={[-1.7, 0.01, 0.6]} size={[2.4, 0.01, 1.4]} color="#d8b98a" />
    </group>
  );
}

// 工位：坐在显示器前，旁边是同事，后面是领导办公室；裁员谈话时切到会议室
export function OfficeScene({ meeting, night }: IndoorProps) {
  return (
    <group>
      <Floor size={[9, 8]} color={night ? "#5f656c" : "#8d949c"} />
      <Walls width={9} depth={8} height={3.2} color={night ? "#9aa1a8" : "#dfe3e6"} />
      {[-2.8, -0.6, 1.6].map(x => <Window key={x} position={[x, 1.8, -3.99]} size={[1.8, 1.4]} sky={night ? WINDOW_SKY.night : "#a9cbe6"} />)}
      {[-2.8, -0.6, 1.6].map(x => [0, 1].map(row => (
        <Box key={`${x}-${row}`} position={[x + 0.2 + row * 0.5, 1.4 + row * 0.35, -4.0]} size={[0.3, 0.6 + row * 0.3, 0.02]} color="#7f97ad" />
      )))}
      <Box position={[0, 0.74, -0.3]} size={[1.8, 0.05, 0.8]} color="#e9e6e0" />
      <Box position={[0, 0.37, -0.65]} size={[1.8, 0.72, 0.04]} color="#c9ccd0" />
      <Box position={[0, 1.0, -0.72]} size={[1.8, 0.5, 0.04]} color="#b7c3c9" />
      <Hot id="computer" marker={[0, 1.55, -0.5]}>
        <Box position={[0, 1.08, -0.5]} size={[0.74, 0.44, 0.04]} color="#27292e" />
        <Screen position={[0, 1.08, -0.475]} size={[0.68, 0.38]} lines={night ? ["上线 checklist 3/11", "回滚预案 已确认", "22:47 线上告警 ×2", "外卖已送达前台", "……"] : ["[紧急] 客户需求变更 v7", "PR #412 待你 review", "绩效自评 截止周五", "午饭吃什么", "……"]} accent={meeting ? "#b84a4a" : "#3d6a9c"} />
        <Box position={[0, 0.8, -0.5]} size={[0.08, 0.1, 0.08]} color="#27292e" />
        <Box position={[0, 0.775, -0.18]} size={[0.5, 0.02, 0.16]} color="#3a3c42" />
      </Hot>
      <Hot id="desk-phone" marker={[0.55, 1.0, -0.12]}>
        <Box position={[0.55, 0.775, -0.12]} size={[0.09, 0.015, 0.17]} color="#1b1c20" emissive="#6fb8ff" />
      </Hot>
      <Cyl position={[-0.55, 0.82, -0.2]} radius={0.05} height={0.12} color="#f5f1e8" />
      {!night && <Figure position={[-1.9, 0, -0.5]} look={{ shirt: "#5f7fa8", hair: "#1f1b19" }} seated rotation={0.3} />}
      <Box position={[-1.9, 0.74, -0.8]} size={[1.4, 0.05, 0.7]} color="#e9e6e0" />
      <Box position={[-1.9, 1.05, -1.05]} size={[0.6, 0.38, 0.04]} color="#27292e" emissive="#274463" />
      {!night && <Figure position={[1.95, 0, -0.5]} look={{ shirt: "#b86b6b", hair: "#4a2f25", hairLong: true }} seated rotation={-0.3} holding="cup" />}
      <Box position={[1.95, 0.74, -0.8]} size={[1.4, 0.05, 0.7]} color="#e9e6e0" />
      <Box position={[1.95, 1.05, -1.05]} size={[0.6, 0.38, 0.04]} color="#27292e" emissive="#274463" />
      {[-2.6, 0, 2.6].map(x => <Box key={x} position={[x, 0.74, -2.4]} size={[1.8, 0.05, 0.7]} color="#e9e6e0" />)}
      {!night && <Figure position={[-2.6, 0, -2.1]} look={{ shirt: "#4f8a55" }} seated rotation={Math.PI} scale={0.95} />}
      {!night && <Figure position={[2.6, 0, -2.1]} look={{ shirt: "#7a6aa8", hairLong: true }} seated rotation={Math.PI} scale={0.95} />}
      {night && <Sign position={[0, 2.7, -3.9]} size={[1.6, 0.3]} text="今晚 23:00 发版" background="#b84a4a" font={44} />}
      <Hot id="leave" marker={[3.4, 2.5, -3.2]}>
        <Box position={[3.4, 1.3, -3.2]} size={[1.6, 2.6, 0.05]} color="#bcd4de" opacity={0.45} />
        <Box position={[3.4, 1.05, -3.18]} size={[0.8, 2.1, 0.06]} color="#6d7880" />
        <Sign position={[3.4, 2.35, -3.15]} size={[0.8, 0.22]} text="总监办公室" background="#2f3a44" font={44} />
      </Hot>
      <Hot id="training" marker={[-4.2, 2.4, -1.6]}>
        <Sign position={[-4.44, 1.7, -1.6]} size={[0.9, 1.2]} text="技能内训报名" background="#e0b24c" color="#3a2a14" rotation={[0, Math.PI / 2, 0]} font={34} />
      </Hot>
      {meeting && (
        <group>
          <Box position={[-0.8, 1.3, -3.1]} size={[2.6, 2.6, 0.05]} color="#bcd4de" opacity={0.4} />
          <Sign position={[-0.8, 2.45, -3.06]} size={[0.9, 0.22]} text="会议室 A · 占用中" background="#b84a4a" font={40} />
          <Figure position={[-1.3, 0, -3.5]} look={{ shirt: "#2f3a44", hair: "#5a5550" }} rotation={0.3} />
          <Figure position={[-0.3, 0, -3.5]} look={{ shirt: "#8a8f96", hairLong: true }} rotation={-0.3} holding="bag" />
        </group>
      )}
      <Plant position={[-3.8, 0, 0.6]} />
    </group>
  );
}

// 爸妈家的客厅：碎花沙发、电视柜、茶几上的座机、抽屉里的存折
export function ParentHomeScene({ month = 1 }: IndoorProps) {
  return (
    <group>
      <Floor size={[7, 5.5]} color="#a57a52" />
      <Walls width={7} depth={5.5} color="#f0e6cf" />
      <Sign position={[-0.6, 1.95, -2.74]} size={[1.6, 0.6]} text="家和万事兴" background="#f6efe0" color="#8a2f2f" font={56} />
      <Box position={[-0.6, 0.3, -2.4]} size={[2.4, 0.6, 0.5]} color="#7a4f33" />
      <Box position={[-0.6, 0.95, -2.5]} size={[1.2, 0.7, 0.08]} color="#1b1c20" emissive="#3a5a7a" />
      <group>
        <Box position={[-0.6, 0.28, 0.9]} size={[2.4, 0.4, 0.9]} color="#b86b6b" />
        <Box position={[-0.6, 0.7, 1.3]} size={[2.4, 0.5, 0.2]} color="#b86b6b" />
        {[-1.3, -0.6, 0.1].map(x => <Ball key={x} position={[x, 0.66, 1.16]} radius={0.06} color="#f3d7a5" />)}
      </group>
      <Figure position={[-1.2, 0, 0.75]} look={{ shirt: "#5f6f7f", hair: "#8d8a84" }} seated rotation={Math.PI} />
      <Hot id="tea" marker={[-0.6, 0.95, -0.2]}>
        <Box position={[-0.6, 0.38, -0.2]} size={[1.2, 0.06, 0.6]} color="#6a4430" />
        <Box position={[-0.6, 0.18, -0.2]} size={[1.1, 0.36, 0.5]} color="#5a3a28" />
        <Box position={[-0.35, 0.46, -0.2]} size={[0.26, 0.1, 0.2]} color="#e4e0d6" />
        <Cyl position={[-0.85, 0.46, -0.15]} radius={0.05} height={0.1} color="#f5f1e8" />
      </Hot>
      <Hot id="drawer" marker={[2.6, 1.35, -1.8]}>
        <Box position={[2.6, 0.5, -1.8]} size={[1.0, 1.0, 0.5]} color="#8a5a3a" />
        {[0.25, 0.55, 0.85].map(y => <Box key={y} position={[2.6, y, -1.54]} size={[0.9, 0.22, 0.02]} color="#9d6a47" />)}
      </Hot>
      <Hot id="home-phone" marker={[0.4, 0.85, 0.85]}>
        <Box position={[0.4, 0.49, 0.85]} size={[0.1, 0.02, 0.17]} color="#1b1c20" emissive="#5fb0ff" />
      </Hot>
      <Hot id="calendar" marker={[3.3, 2.3, 0.3]}>
        <Sign position={[3.44, 1.75, 0.3]} size={[0.55, 0.75]} text={`${month}月`} background="#c24b4b" rotation={[0, -Math.PI / 2, 0]} font={72} />
      </Hot>
      <Plant position={[2.8, 0, 1.6]} />
      <Plant position={[-2.9, 0, -2.2]} />
    </group>
  );
}

// 年夜饭圆桌：亲戚围坐在后半圈，当前提问的人头顶挂一个问号
const RELATIVE_LOOKS = [
  { shirt: "#a8412f", hair: "#3a2a22", hairLong: true },
  { shirt: "#3f5a7a", hair: "#2a2522" },
  { shirt: "#d98f6a", hair: "#1f1b19", hairLong: true },
  { shirt: "#6f5a8a", hair: "#d9d4cc", hairLong: true },
  { shirt: "#4f7a5a", hair: "#2a2522", hairLong: true },
  { shirt: "#7a6a52", hair: "#5a5550" },
];

export function ReunionScene({ speaker = -1 }: IndoorProps) {
  const seats = RELATIVE_LOOKS.map((look, index) => {
    const angle = Math.PI + 0.35 + (index / (RELATIVE_LOOKS.length - 1)) * (Math.PI - 0.7);
    const x = Math.cos(angle) * 1.5;
    const z = Math.sin(angle) * 1.5 - 0.6;
    return { look, x, z, rotation: Math.atan2(-Math.cos(angle), -Math.sin(angle)) };
  });
  return (
    <group>
      <Floor size={[8, 6.5]} color="#8a5a3a" />
      <Walls width={8} depth={6.5} color="#e9d7b8" />
      <Window position={[2.2, 1.7, -3.24]} size={[1.6, 1.2]} sky={WINDOW_SKY.night} />
      {[[1.8, 2.0], [2.5, 1.55], [2.1, 1.35]].map(([x, y]) => <Ball key={`${x}-${y}`} position={[x, y, -3.18]} radius={0.07} color="#ffcf6a" emissive />)}
      <Sign position={[-1.2, 1.85, -3.2]} size={[0.8, 0.8]} text="福" background="#c0302a" color="#ffd66b" font={90} />
      <Box position={[-2.8, 0.45, -2.9]} size={[1.4, 0.9, 0.45]} color="#6a4128" />
      <Box position={[-2.8, 1.25, -2.95]} size={[1.24, 0.72, 0.05]} color="#1b1c20" />
      <Sign position={[-2.8, 1.25, -2.91]} size={[1.14, 0.62]} text="春节联欢晚会" background="#b8433a" color="#ffe3a0" font={40} glow />
      {[-2.2, 0, 2.2].map(x => (
        <group key={x} position={[x, 2.45, -1.2]}>
          <Cyl position={[0, 0.35, 0]} radius={0.01} height={0.5} color="#3a2a22" />
          <Ball position={[0, 0, 0]} radius={0.2} color="#d8342a" emissive />
          <Cyl position={[0, -0.24, 0]} radius={0.03} height={0.14} color="#ffcf6a" />
        </group>
      ))}
      <Cyl position={[0, 0.72, -0.6]} radius={1.15} height={0.05} color="#b8322a" segments={28} />
      <Cyl position={[0, 0.36, -0.6]} radius={0.12} height={0.7} color="#5a3a24" />
      <Cyl position={[0, 0.77, -0.6]} radius={0.55} height={0.03} color="#e9e1d2" segments={24} />
      {[
        { x: 0, z: -0.6, food: "#c9793c" },
        { x: 0.35, z: -0.35, food: "#d9c9a2" },
        { x: -0.35, z: -0.35, food: "#5f9a4f" },
        { x: 0.3, z: -0.9, food: "#b8433a" },
        { x: -0.3, z: -0.9, food: "#f0e0b8" },
      ].map(dish => (
        <group key={`${dish.x}-${dish.z}`}>
          <Cyl position={[dish.x, 0.8, dish.z]} radius={0.15} height={0.03} color="#f6f2ea" segments={16} />
          <Ball position={[dish.x, 0.85, dish.z]} radius={0.09} color={dish.food} />
        </group>
      ))}
      {seats.map((seat, index) => (
        <group key={seat.look.shirt}>
          <Box position={[seat.x * 1.08, 0.24, seat.z * 1.04 - 0.02]} size={[0.4, 0.48, 0.4]} color="#6a4128" />
          <Figure position={[seat.x, 0, seat.z]} look={seat.look} seated rotation={seat.rotation} scale={0.95} holding={index === 1 ? "cup" : undefined} />
          {index === speaker && <Sign position={[seat.x, 1.48, seat.z]} size={[0.26, 0.26]} text="？" background="#ffd66b" color="#8a2f2f" font={90} />}
        </group>
      ))}
    </group>
  );
}

// 医院走廊：冷白灯、长椅、住院部指示牌，妈妈坐在长椅上等你
export function HospitalScene() {
  return (
    <group>
      <Floor size={[5, 12]} color="#b9c6c2" />
      <Box position={[-2.5, 1.4, -2]} size={[0.1, 2.8, 12]} color="#eef1f0" />
      <Box position={[2.5, 1.4, -2]} size={[0.1, 2.8, 12]} color="#eef1f0" />
      <Box position={[-2.44, 0.45, -2]} size={[0.02, 0.9, 12]} color="#7fb2a2" />
      <Box position={[2.44, 0.45, -2]} size={[0.02, 0.9, 12]} color="#7fb2a2" />
      <Box position={[0, 1.4, -8]} size={[5, 2.8, 0.1]} color="#dfe6e4" />
      {[-5, -2.6, -0.2].map((z, index) => (
        <group key={z}>
          <Box position={[-2.43, 1.05, z]} size={[0.06, 2.1, 0.9]} color="#9fb8c2" />
          <Sign position={[-2.4, 2.3, z]} size={[0.6, 0.18]} text={`30${index + 1} 病房`} background="#2f6f5f" font={40} rotation={[0, Math.PI / 2, 0]} />
          <Box position={[0, 2.78, z]} size={[1.4, 0.03, 0.3]} color="#ffffff" emissive="#eaf6ff" />
        </group>
      ))}
      <Sign position={[0, 2.2, -7.9]} size={[1.4, 0.36]} text="住院部 3F" background="#2f6f5f" font={56} />
      <Sign position={[2.43, 1.9, -3.4]} size={[0.8, 0.26]} text="请保持安静" background="#f6f2ea" color="#2f6f5f" font={44} rotation={[0, -Math.PI / 2, 0]} />
      <Hot id="hospital-bench" marker={[1.9, 1.2, -1.2]}>
        {[-2, -1.2].map(z => <Box key={z} position={[2.05, 0.42, z]} size={[0.5, 0.06, 0.7]} color="#4f8aa8" />)}
        <Box position={[2.3, 0.7, -1.6]} size={[0.06, 0.5, 1.6]} color="#4f8aa8" />
        <Box position={[2.05, 0.2, -1.6]} size={[0.4, 0.4, 0.06]} color="#7f8a90" />
      </Hot>
      <Hot id="hospital-call" marker={[2.0, 1.75, -2.0]}>
        <Figure position={[2.0, 0, -2.0]} look={{ shirt: "#b86b6b", hair: "#3a2a22", hairLong: true }} seated rotation={-Math.PI / 2} holding="phone" />
      </Hot>
      <Hot id="hospital-phone" marker={[-0.4, 1.9, 0.9]}>
        <Figure position={[-0.4, 0, 0.9]} look={{ shirt: "#3f5a7a", hair: "#1f1b19" }} rotation={Math.PI - 0.3} holding="phone" />
      </Hot>
      <Figure position={[-1.3, 0, -4.4]} look={{ shirt: "#f4f6f6", pants: "#f4f6f6", hair: "#1f1b19", hairLong: true }} rotation={0.4} holding="bag" />
      <Plant position={[-2.0, 0, -6.8]} />
    </group>
  );
}

import { BOSSES, CHARMS, CONTENT_VERSION, DIFFICULTIES } from "./content";
import type { Progress } from "./progress";

export async function chapterImage(input: Progress): Promise<Blob> {
  const progress = structuredClone(input);
  if (progress.campaign.cleared.length !== 3) throw new Error("首章尚未完成");
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 840;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法生成战报");
  const image = new Image();
  image.src = "/games/one-more/final-court.webp";
  await image.decode();
  ctx.fillStyle = "#f4f7ef";
  ctx.fillRect(0, 0, 1200, 840);
  ctx.drawImage(image, 0, 0, image.width, image.height * 0.56, 0, 0, 1200, 285);
  ctx.fillStyle = "#f4f7ef";
  ctx.fillRect(40, 36, 570, 178);
  ctx.fillStyle = "#263f3c";
  ctx.font = "bold 54px Microsoft YaHei";
  ctx.fillText("岁岁过招", 70, 115);
  ctx.font = "26px Microsoft YaHei";
  ctx.fillText("三庭收钟 · 首章已过", 73, 172);
  ctx.fillStyle = "#b92f4a";
  ctx.font = "bold 32px Microsoft YaHei";
  ctx.fillText("这一夜，记你的名字。", 62, 345);
  const total = progress.campaign.cleared.reduce(
    (sum, record) => sum + record.elapsed,
    0,
  );
  const seconds = (ms: number) => `${Math.floor(ms / 60000)}:${Math.floor((ms / 1000) % 60)
      .toString()
      .padStart(2, "0")}`;
  ctx.fillStyle = "#557168";
  ctx.font = "20px Microsoft YaHei";
  ctx.fillText(
    `获胜场次用时 ${seconds(total)}    护符：${CHARMS.find((charm) => charm.id === progress.charm)?.name}`,
    65,
    387,
  );
  progress.campaign.cleared.forEach((record, index) => {
    const y = 465 + index * 90;
    ctx.strokeStyle = "#b8c8bd";
    ctx.beginPath();
    ctx.moveTo(62, y + 42);
    ctx.lineTo(1138, y + 42);
    ctx.stroke();
    ctx.fillStyle = "#263f3c";
    ctx.font = "bold 26px Microsoft YaHei";
    ctx.fillText(`${index + 1}  ${BOSSES[index].name}`, 64, y);
    ctx.font = "20px Microsoft YaHei";
    ctx.fillText(
      `${DIFFICULTIES[record.difficulty].name}  /  ${record.attempts} 次尝试`,
      290,
      y,
    );
    ctx.fillText(
      `弹反 ${record.stats.parries}   破架 ${record.stats.breaks}   反击 ${record.stats.counters}`,
      530,
      y,
    );
    ctx.fillStyle = record.vowMet ? "#b92f4a" : "#557168";
    ctx.fillText(record.vowMet ? "一约已成" : "胜负已分", 1000, y);
  });
  ctx.fillStyle = "#557168";
  ctx.font = "18px Microsoft YaHei";
  ctx.fillText(`挑战种子 ${progress.campaign.seed}  ·  v${CONTENT_VERSION}`, 65, 780);
  ctx.textAlign = "right";
  ctx.fillText(`${window.location.host}/game/one-more`, 1138, 780);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("战报导出失败"))),
      "image/png",
    );
  });
}

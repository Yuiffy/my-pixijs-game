import { Questionnaire, QUESTIONNAIRES } from './questionnaires';
import { Session, calculate } from './questions';

// A growing sheet keeps free text and creator answers readable in exported images.
export function drawTextCard(title: string, text: string): string {
  const canvas = document.createElement('canvas');
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas unavailable');
  const font = '700 32px "Zen Maru Gothic","Microsoft YaHei",sans-serif';
  g.font = font;
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const ch of paragraph) {
      if (g.measureText(line + ch).width > 960) { lines.push(line); line = ch; } else line += ch;
    }
    lines.push(line);
  }
  canvas.width = 1200; canvas.height = Math.max(1200, 360 + lines.length * 52);
  g.fillStyle = '#e4e5e8'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#ff33c4'; g.fillRect(40, 40, 14, canvas.height - 80); g.fillRect(1146, 40, 14, canvas.height - 80);
  g.textAlign = 'center'; g.font = '900 50px "Microsoft YaHei",sans-serif'; g.fillText(title, 600, 130, 1040);
  g.fillRect(100, 170, 1000, 4); g.fillStyle = '#4a2140'; g.textAlign = 'left'; g.font = font;
  lines.forEach((line, i) => g.fillText(line, 120, 250 + i * 52));
  g.fillStyle = '#ff33c4'; g.textAlign = 'center'; g.font = '24px "Microsoft YaHei",sans-serif';
  g.fillText('题表：健屋花那 · 原表设计：ありあ · 中文互动版', 600, canvas.height - 40);
  return canvas.toDataURL('image/png');
}

// Preserve the original 1200px square result-sheet composition.
export function drawResultCard(session: Session, quiz: Questionnaire = QUESTIONNAIRES[0]): string {
  if (session.notes) {
    const { counts } = calculate(session.answers);
    return drawTextCard(`${quiz.subtitle}${quiz.title}`, [
      ...quiz.labels.map((label, i) => `${i + 1}. ${label}：${counts[i]}`), '',
      ...quiz.questions.map((q, i) => `${String(i + 1).padStart(2, '0')}. ${q} → ${quiz.labels[session.answers[i] ?? 2]}`), '',
      `补充：${session.notes}`,
    ].join('\n'));
  }
  const { counts, type: originalType } = calculate(session.answers);
  const type = quiz.original ? originalType : { name: '我的分类结果', description: '每一种判断，都记录着你对亲密关系的想法。没有标准答案，和朋友一起聊聊吧。' };
  const canvas = document.createElement('canvas');
  canvas.width = 1200; canvas.height = 1200;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('Canvas unavailable');
  const pink = '#ff33c4'; const paper = '#e4e5e8'; const text = '#4a2140';
  const body = '"Zen Maru Gothic","Microsoft YaHei","PingFang SC",sans-serif';
  const num = '"Archivo","Helvetica Neue",Arial,sans-serif';
  g.fillStyle = paper; g.fillRect(0, 0, 1200, 1200);
  g.fillStyle = pink; g.textBaseline = 'middle'; g.font = `900 52px ${num}`;
  g.textAlign = 'left'; g.fillText('✕✕✕', 44, 72);
  g.textAlign = 'right'; g.fillText('✕✕✕', 1156, 72);
  g.beginPath(); g.roundRect(300, 46, 600, 52, 26); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.font = `800 26px ${num}`;
  g.fillText('R E S U L T', 600, 73);
  g.fillStyle = pink;
  for (const x of [40, 1142]) { g.beginPath(); g.roundRect(x, 140, 18, 1000, 9); g.fill(); }
  g.font = `900 30px ${body}`; g.fillText(`${quiz.subtitle}${quiz.title}`, 600, 175);
  g.fillStyle = text; g.font = `900 34px ${body}`; g.fillText('你的判定类型是……', 600, 250);
  g.fillStyle = pink; g.font = '400 118px "Dela Gothic One","Microsoft YaHei",sans-serif'; g.fillText(type.name, 600, 355, 1000);
  g.fillStyle = text; g.font = `700 30px ${body}`;
  let line = ''; let y = 450;
  for (const ch of type.description) {
    if (g.measureText(line + ch).width > 940) { g.fillText(line, 600, y); line = ch; y += 46; } else line += ch;
  }
  g.fillText(line, 600, y);
  quiz.labels.map((label, i) => `${i + 1}. ${label}`).forEach((label, i) => {
    const x = 120 + i * 330;
    g.lineWidth = 6; g.strokeStyle = pink; g.fillStyle = i === 0 ? pink : paper;
    g.fillRect(x, 530, 300, 170); g.strokeRect(x, 530, 300, 170);
    g.fillStyle = i === 0 ? '#fff' : pink;
    g.font = `900 96px ${num}`; g.fillText(String(counts[i]), x + 150, 602);
    g.font = `900 28px ${body}`; g.fillText(label, x + 150, 670, 280);
  });
  session.answers.forEach((answer, i) => {
    const x = 187 + (i % 10) * 84; const top = 760 + Math.floor(i / 10) * 84;
    g.lineWidth = 6; g.strokeStyle = pink;
    if (answer === 0) { g.fillStyle = pink; g.fillRect(x, top, 70, 70); } else {
      if (answer === 1) { g.fillStyle = '#ffc2ec'; g.fillRect(x, top, 70, 70); }
      g.strokeRect(x + 3, top + 3, 64, 64);
    }
    g.fillStyle = answer === 0 ? '#fff' : '#d61fa3'; g.font = `900 24px ${num}`;
    g.fillText(String(i + 1).padStart(2, '0'), x + 35, top + 36);
  });
  g.fillStyle = pink; g.fillRect(150, 1110, 900, 4);
  g.fillStyle = text; g.font = `900 30px ${body}`;
  g.fillText(quiz.reflection ? `换成自己会改变答案吗？ → ${session.reflection ? '会' : '不会'}` : '按题号回顾你的选择 · 深色① / 浅色② / 空心③', 600, 1142);
  g.fillStyle = pink; g.font = `700 20px ${body}`;
  g.fillText('原始题表：健屋花那 / 原表设计：ありあ / 互动版参考：ikura1', 600, 1182);
  return canvas.toDataURL('image/png');
}

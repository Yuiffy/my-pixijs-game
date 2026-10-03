// Offline Windows voice baking. SAPI writes WAV files; it never opens the speaker.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import { loadTypescriptModule } from './tests/helpers/load-typescript-module.mjs';
const { LANDMARKS } = await loadTypescriptModule('src/components/nightRain/world.ts');
const { targetLabel } = await loadTypescriptModule('src/components/nightRain/companion.ts');
const lines = new Set();
for (const file of ['companion.ts', 'engine.ts', 'bossRoster.ts', 'chapter.ts', 'valley.ts', 'haven.ts']) {
  const source = await fs.readFile(`src/components/nightRain/${file}`, 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const visit = node => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[\u4e00-\u9fff]/.test(node.text) && node.text.length >= 9) lines.add(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
}
lines.add('下播啦！我陪你去找热乎的晚饭。迷路时按 C 叫我就好。');
lines.add('别怕，我一直在这里。慢慢走就好。');
for (const id of [...LANDMARKS.map(l => l.id), 'boss', 'gate-captain', 'rain-regent', 'drowned-warden', 'silent-abbot', 'river-serpent', 'crypt-colossus', 'cave-sentinel']) {
  const label = targetLabel(id);
  lines.add(`好呀，去${label}！我走前面，你慢慢跟上。`);
  lines.add(`到了，${label}就在这里。靠近后按 E 试试。`);
  lines.add(`越来越近了！${label}就在旁边，靠近后按 E。`);
}
const out = 'public/games/night-rain/audio/voice';
await fs.mkdir(out, { recursive: true });
await fs.mkdir('tmp/night-rain-voice-wav', { recursive: true });
const manifest = Object.fromEntries([...lines].sort().map(text => [text, crypto.createHash('sha256').update(text).digest('hex').slice(0, 16)]));
await fs.writeFile('src/components/nightRain/voiceManifest.json', JSON.stringify(manifest, null, 2) + '\n');
await fs.writeFile('tmp/night-rain-voice-lines.json', JSON.stringify(Object.entries(manifest).map(([text, id]) => ({ text, id }))));
console.log(`${lines.size} local voice lines ready`);

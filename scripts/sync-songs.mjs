import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLiverConfig } from './liver-config.js';
import { getIndexLiverDir } from './stream-shards.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const portableBase = file => String(file || '').split(/[\\/]/).at(-1);
const recordingKey = file => portableBase(file).replace(/\.[^.]+$/, '');

// Only the active plan's manifest can identify a publication. Historical revisions
// can reuse activity-1 for completely different content.
export function publicationsFor(directory, record) {
  const planFile = path.join(directory, 'PLAN.json');
  if (!fs.existsSync(planFile)) return new Map();
  const plan = read(planFile);
  if (plan.sessionId !== record.sessionId || !plan.uploadManifestPath) return new Map();
  const manifestFile = path.resolve(plan.uploadManifestPath);
  const relative = path.relative(directory, manifestFile);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Activity manifest is outside its session');
  const manifest = read(manifestFile);
  const stateFile = path.join(path.dirname(manifestFile), 'upload_state.json');
  if (!fs.existsSync(stateFile)) return new Map();
  const state = read(stateFile);
  const result = new Map();
  for (const clip of manifest.clips || []) {
    const metadataFile = path.join(path.dirname(manifestFile), portableBase(clip.metadataPath));
    const metadata = read(metadataFile);
    if (metadata.kind !== 'songs' || metadata.type !== 'stream_activity_submission'
      || metadata.planSignature !== plan.signature
      || recordingKey(metadata.source?.mediaPath) !== recordingKey(record.source?.mediaPath)) continue;
    const uploaded = state.done?.[String(clip.reviewIndex)];
    if (!/^BV[0-9A-Za-z]{10}$/.test(uploaded?.bvid || '')) continue;
    for (const song of record.songs || []) {
      const activity = metadata.activities?.find(event => event.id === song.activityId
        && event.start === song.start && event.end === song.end);
      const partIndex = metadata.output?.parts?.findIndex(part => part.activityId === song.activityId);
      if (!activity || !(partIndex >= 0)) continue;
      result.set(song.activityId, {
        bvid: uploaded.bvid, part: partIndex + 1,
        url: `https://www.bilibili.com/video/${uploaded.bvid}/?p=${partIndex + 1}`,
      });
    }
  }
  return result;
}

export function collectSongFiles(sourceDirs) {
  const files = [];
  for (const root of sourceDirs) {
    if (!fs.existsSync(root)) continue;
    for (const date of fs.readdirSync(root, { withFileTypes: true })) {
      if (!date.isDirectory() || !/^\d{4}_\d{2}_\d{2}$/.test(date.name)) continue;
      const activities = path.join(root, date.name, 'stream_activity_clips');
      if (!fs.existsSync(activities)) continue;
      for (const session of fs.readdirSync(activities, { withFileTypes: true })) {
        if (!session.isDirectory() || session.isSymbolicLink()) continue;
        const file = path.join(activities, session.name, 'SONGS.json');
        if (fs.existsSync(file)) files.push(file);
      }
    }
  }
  return files;
}

export function buildSongCatalog(files, generatedAt = new Date().toISOString()) {
  const records = new Map();
  for (const file of files) {
    const record = read(file);
    if (record.type !== 'sui_stream_song_record' || String(record.roomId) !== '25788785') continue;
    if (!record.sessionId || !Array.isArray(record.songs)
      || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(record.recordedAt)
      || !Number.isFinite(Date.parse(`${record.recordedAt.replace(' ', 'T')}+08:00`))) throw new Error(`Invalid song record: ${file}`);
    const mtime = fs.statSync(file).mtimeMs;
    const old = records.get(record.sessionId);
    if (!old || mtime > old.mtime) records.set(record.sessionId, { record, file, mtime });
  }
  const sessions = [];
  const performances = [];
  for (const { record, file } of records.values()) {
    const complete = record.coverage?.status === 'complete' && ['planned', 'rendered'].includes(record.status);
    const title = recordingKey(record.source?.mediaPath).replace(/^录制-\d+-\d{8}-\d{6}-\d+-/, '');
    sessions.push({ id: record.sessionId, recordedAt: record.recordedAt, title, complete });
    const publications = publicationsFor(path.dirname(file), record);
    for (const song of record.songs) {
      if (!song.activityId || !Number.isFinite(song.start) || song.start < 0
        || !Number.isFinite(song.end) || song.end <= song.start
        || !['full', 'fragment'].includes(song.performance)) throw new Error(`Invalid performance: ${file}`);
      const confirmed = complete && song.verificationStatus === 'keep'
        && !(song.reviewIssues || []).some(issue => ['media_verification_unconfirmed', 'source_transcript_timing_unreliable'].includes(issue));
      performances.push({
        id: `${record.sessionId}:${song.activityId}`, sessionId: record.sessionId,
        name: typeof song.name === 'string' && song.name.trim() ? song.name.trim() : null,
        start: song.start, end: song.end, performance: song.performance,
        confirmed, boundariesConfirmed: song.startObserved === true && song.endObserved === true,
        clip: publications.get(song.activityId) || null,
      });
    }
  }
  sessions.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  return { version: 1, generatedAt, sessions, performances };
}

export function syncSongs({ sourceDirs = getLiverConfig('sui').sourceDirs, output = path.join(getIndexLiverDir('sui'), 'songs.json') } = {}) {
  if (!sourceDirs.some(dir => fs.existsSync(dir))) throw new Error('No Sui recording sources are available');
  const catalog = buildSongCatalog(collectSongFiles(sourceDirs));
  // Keep timestamps stable when nothing changed; do not churn the scheduled index.
  if (fs.existsSync(output)) {
    const previous = read(output);
    if (JSON.stringify({ ...previous, generatedAt: null }) === JSON.stringify({ ...catalog, generatedAt: null })) return previous;
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const temporary = `${output}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(catalog, null, 2)}\n`);
  fs.renameSync(temporary, output);
  console.log(`Song catalog: ${catalog.sessions.length} sessions, ${catalog.performances.length} records -> ${output}`);
  return catalog;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const output = args.includes('--snapshot')
    ? path.resolve('src/data/songs/sui.json') : args.includes('--output') ? path.resolve(args[args.indexOf('--output') + 1]) : undefined;
  syncSongs({ output });
}

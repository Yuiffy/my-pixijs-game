import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLiverConfig } from './liver-config.js';
import { getIndexLiverDir } from './stream-shards.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const titleCorrections = read(new URL('../src/data/songs/title-corrections.json', import.meta.url));

// A title correction belongs to one reviewed activity revision, never just an ID.
export function correctedSongName(sessionId, song, corrections = titleCorrections) {
  if (typeof song.name === 'string' && song.name.trim()) return song.name.trim();
  return corrections.find(entry => entry.sessionId === sessionId
    && entry.activityId === song.activityId && entry.start === song.start && entry.end === song.end)?.name || null;
}
const portableBase = file => String(file || '').split(/[\\/]/).at(-1);
const recordingKey = file => portableBase(file).replace(/\.[^.]+$/, '');
function resolveSessionPath(directory, value) {
  let resolved = path.resolve(value);
  let relative = path.relative(directory, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    const parts = String(value).split(/[\\/]/);
    const index = parts.lastIndexOf(portableBase(directory));
    if (index >= 0) resolved = path.resolve(directory, ...parts.slice(index + 1));
    relative = path.relative(directory, resolved);
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Activity manifest is outside its session');
  return resolved;
}

// Only the active plan's manifest can identify a publication. Historical revisions
// can reuse activity-1 for completely different content.
export function songDetailsFor(directory, record) {
  const planFile = path.join(directory, 'PLAN.json');
  if (!fs.existsSync(planFile)) return new Map();
  const plan = read(planFile);
  if (!plan.signature || plan.sessionId !== record.sessionId) return new Map();
  const result = new Map();
  const metadataFiles = [];
  const pending = [directory];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name);
      if (entry.isDirectory() && !entry.isSymbolicLink()) pending.push(file);
      else if (entry.isFile() && entry.name.toLowerCase() === 'songs.json') metadataFiles.push(file);
    }
  }
  metadataFiles.sort((a, b) => fs.statSync(a).mtimeMs - fs.statSync(b).mtimeMs);
  // The active publication manifest is authoritative for links, but reviewed
  // names may live in a later retry/revision. Read all same-signature metadata
  // under the session so a later correction replaces an earlier null name.
  const publicationByActivity = new Map();
  if (plan.uploadManifestPath) {
    const manifestFile = resolveSessionPath(directory, plan.uploadManifestPath);
    if (fs.existsSync(manifestFile)) {
      const manifest = read(manifestFile);
      const stateFile = path.join(path.dirname(manifestFile), 'upload_state.json');
      const state = fs.existsSync(stateFile) ? read(stateFile) : {};
      for (const clip of manifest.clips || []) publicationByActivity.set(String(clip.metadataPath), {
        uploaded: state.done?.[String(clip.reviewIndex)],
        metadataPath: path.join(path.dirname(manifestFile), portableBase(clip.metadataPath)),
      });
    }
  }
  for (const metadataFile of metadataFiles) {
    let metadata;
    try { metadata = read(metadataFile); } catch { continue; }
    if (metadata.kind !== 'songs' || metadata.type !== 'stream_activity_submission'
      || metadata.planSignature !== plan.signature
      || recordingKey(metadata.source?.mediaPath) !== recordingKey(record.source?.mediaPath)) continue;
    const review = metadata.activityReview;
    const reviewed = review?.status === 'approved'
      && (review.authority === 'human' || (review.authority === 'automatic' && review.checks?.titles === true));
    for (const song of record.songs || []) {
      const activity = metadata.activities?.find(event => event.id === song.activityId
        && event.start === song.start && event.end === song.end);
      if (!activity) continue;
      const partIndex = metadata.output?.parts?.findIndex(part => part.activityId === song.activityId);
      if (!(partIndex >= 0)) continue;
      const part = metadata.output.parts[partIndex];
      const evidence = metadata.presentation?.titleEvidence?.items?.filter(item => item.activityId === song.activityId) || [];
      const title = typeof part.name === 'string' ? part.name.trim() : evidence[0]?.name?.trim();
      const publication = [...publicationByActivity.values()].find(item => path.resolve(item.metadataPath) === path.resolve(metadataFile));
      const clip = /^BV[0-9A-Za-z]{10}$/.test(publication?.uploaded?.bvid || '') ? {
        bvid: publication.uploaded.bvid, part: partIndex + 1,
        url: `https://www.bilibili.com/video/${publication.uploaded.bvid}/?p=${partIndex + 1}`,
      } : null;
      if (reviewed && title && (!evidence.length || evidence.every(item => item.name === title))) {
        result.set(song.activityId, { ...(result.get(song.activityId) || {}), name: title });
      }
      if (clip) result.set(song.activityId, { ...(result.get(song.activityId) || { name: null }), clip });
    }
  }
  // Retain the old behavior for reviewed metadata that is only reachable via
  // the manifest, while allowing later historical revisions to fill names.
  for (const song of record.songs || []) if (!result.has(song.activityId)) result.set(song.activityId, { name: null, clip: null });
  return result;
}

// Preserve the publication-only API; a reviewed name is available before upload.
export function publicationsFor(directory, record) {
  return new Map([...songDetailsFor(directory, record)].filter(([, value]) => value.clip)
    .map(([id, value]) => [id, value.clip]));
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
    const details = songDetailsFor(path.dirname(file), record);
    for (const song of record.songs) {
      if (!song.activityId || !Number.isFinite(song.start) || song.start < 0
        || !Number.isFinite(song.end) || song.end <= song.start
        || !['full', 'fragment'].includes(song.performance)) throw new Error(`Invalid performance: ${file}`);
      const confirmed = complete && song.verificationStatus === 'keep'
        && !(song.reviewIssues || []).some(issue => ['media_verification_unconfirmed', 'source_transcript_timing_unreliable'].includes(issue));
      performances.push({
        id: `${record.sessionId}:${song.activityId}`, sessionId: record.sessionId,
        name: correctedSongName(record.sessionId, song) || details.get(song.activityId)?.name || null,
        start: song.start, end: song.end, performance: song.performance,
        confirmed, boundariesConfirmed: song.startObserved === true && song.endObserved === true,
        clip: details.get(song.activityId)?.clip || null,
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

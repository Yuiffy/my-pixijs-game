import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLiverConfig } from './liver-config.js';
import { correctedSongName, songDetailsFor } from './sync-songs.mjs';
import { getIndexLiverDir } from './stream-shards.mjs';
import { parseStreamArtifact, copyFileIfChanged } from './stream-sync-helpers.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const basename = file => String(file || '').split(/[\\/]/).at(-1);
const recordingKey = file => basename(file).replace(/\.[^.]+$/, '');
const names = value => (Array.isArray(value) ? value.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim()) : []);
const normalize = name => name.normalize('NFKC').toLocaleLowerCase().replace(/[\s《》]+/g, '');
const validRange = event => Number.isFinite(event.start) && event.start >= 0 && Number.isFinite(event.end) && event.end > event.start;

export function composeStreamTexts(documents) {
  const sections = { '直播梗概': [], '晚安回复': [], Highlight: [] };
  for (const { file, content } of documents) {
    if (/_COMIC_(?:SCRIPT|FACTORY)/i.test(file)) continue;
    const heading = /晚安/i.test(file) ? '晚安回复' : /AI_HIGHLIGHT/i.test(file) ? 'Highlight' : '直播梗概';
    if (content.trim() && !sections[heading].includes(content.trim())) sections[heading].push(content.trim());
  }
  return Object.entries(sections).filter(([, texts]) => texts.length)
    .map(([heading, texts]) => `## ${heading}\n\n${texts.join('\n\n')}`).join('\n\n---\n\n');
}

function sessionPath(directory, value) {
  let resolved = path.resolve(value);
  let relative = path.relative(directory, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    // Historical recordings were moved from D: to E:. Resolve the stored path
    // under the same recording directory, then still enforce that boundary.
    const parts = String(value).split(/[\\/]/);
    const index = parts.lastIndexOf(basename(directory));
    if (index >= 0) resolved = path.resolve(directory, ...parts.slice(index + 1));
    relative = path.relative(directory, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Recap artifact is outside its session: ${value}`);
  }
  return resolved;
}

// An activity ID can be reused by a later plan. Match the current revision,
// recording, event boundaries and actual upload part before showing a BV link.
export function activityPublications(directory, plan) {
  const result = new Map();
  if (!plan?.signature || !plan.uploadManifestPath) return result;
  const manifestFile = sessionPath(directory, plan.uploadManifestPath);
  if (!fs.existsSync(manifestFile)) return result;
  const manifest = read(manifestFile);
  const stateFile = path.join(path.dirname(manifestFile), 'upload_state.json');
  if (!fs.existsSync(stateFile)) return result;
  const state = read(stateFile);
  for (const clip of manifest.clips || []) {
    const uploaded = state.done?.[String(clip.reviewIndex)];
    if (!/^BV[0-9A-Za-z]{10}$/.test(uploaded?.bvid || '')) continue;
    const metadataFile = sessionPath(directory, clip.metadataPath);
    const metadata = read(metadataFile);
    const kind = { songs: 'song', game: 'game', watch: 'watch' }[metadata.kind];
    if (!kind || metadata.type !== 'stream_activity_submission' || metadata.planSignature !== plan.signature
      || !plan.source?.mediaPath || recordingKey(metadata.source?.mediaPath) !== recordingKey(plan.source.mediaPath)) continue;
    for (const event of plan.events || []) {
      if (event.kind !== kind || !validRange(event)) continue;
      const activity = metadata.activities?.find(item => item.id === event.id && item.kind === kind
        && item.start === event.start && item.end === event.end);
      const partIndex = metadata.output?.parts?.findIndex(part => part.activityId === event.id);
      if (!activity || !(partIndex >= 0)) continue;
      const part = metadata.output.parts[partIndex];
      result.set(event.id, {
        name: typeof part.name === 'string' && part.name.trim() ? part.name.trim() : part.title?.match(/《([^》]+)》/)?.[1],
        clip: { bvid: uploaded.bvid, part: partIndex + 1, url: `https://www.bilibili.com/video/${uploaded.bvid}/?p=${partIndex + 1}` },
      });
    }
  }
  return result;
}

export function gamePublications(directory, plan) {
  const result = [];
  if (!plan?.signature || !plan.renderSignature || !plan.uploadManifestPath) return result;
  const manifestFile = sessionPath(directory, plan.uploadManifestPath);
  if (!fs.existsSync(manifestFile)) return result;
  const stateFile = path.join(path.dirname(manifestFile), 'upload_state.json');
  if (!fs.existsSync(stateFile)) return result;
  const manifest = read(manifestFile);
  const state = read(stateFile);
  for (const submission of manifest.clips || []) {
    const uploaded = state.done?.[String(submission.reviewIndex)];
    if (!/^BV[0-9A-Za-z]{10}$/.test(uploaded?.bvid || '')) continue;
    const metadata = read(sessionPath(directory, submission.metadataPath));
    if (metadata.type !== 'stream_game_submission' || metadata.kind !== 'games'
      || metadata.planSignature !== plan.signature || metadata.renderSignature !== plan.renderSignature
      || !plan.source?.mediaPath || recordingKey(metadata.source?.mediaPath) !== recordingKey(plan.source.mediaPath)) continue;
    const parts = metadata.output?.parts || [];
    const partIndex = parts.findIndex(part => validRange(part) && (metadata.activities || []).some(activity => {
      const event = (plan.events || []).find(item => item.id === activity.id && item.gameId === metadata.gameId);
      return event && activity.gameId === metadata.gameId && part.gameId === metadata.gameId && part.activityId === activity.id
        && activity.sourceWindow?.start === event.start && activity.sourceWindow?.end === event.end
        && activity.start >= event.start && activity.end <= event.end
        && part.start >= activity.start && part.end <= activity.end;
    }));
    if (partIndex < 0) continue;
    const title = typeof metadata.copy?.title === 'string' ? metadata.copy.title : '';
    const name = title.match(/^(.+?) 第\d+集/)?.[1] || metadata.gameId;
    if (typeof name !== 'string' || !name.trim()) continue;
    result.push({ name, clip: { bvid: uploaded.bvid, part: partIndex + 1, url: `https://www.bilibili.com/video/${uploaded.bvid}/?p=${partIndex + 1}`, ...(title ? { title } : {}) } });
  }
  return result;
}

function uniqueItems(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${normalize(item.name)}:${item.start ?? ''}:${JSON.stringify(item.clips || [])}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildStreamRecap(summary, { liverId, plan, songs, songDetails = new Map(), publications = new Map(), games = [] } = {}) {
  if (summary?.status !== 'success' || !summary.content || typeof summary.content.overview !== 'string') return null;
  const content = summary.content;
  const events = Array.isArray(plan?.events) ? plan.events : summary.activityTimeline?.events || [];
  const recap = { overview: content.overview.trim(), songs: [], games: [], watch: [], other: [] };
  if (typeof summary.generatedAt === 'string' && Number.isFinite(Date.parse(summary.generatedAt))) recap.generatedAt = summary.generatedAt;
  const songEvents = Array.isArray(songs?.songs) ? songs.songs.map(song => ({ ...song, id: song.activityId })) : events.filter(event => event.kind === 'song');
  for (const event of songEvents.filter(validRange)) {
    const published = publications.get(event.id);
    const name = (liverId === 'sui' ? correctedSongName(songs?.sessionId || plan?.sessionId, { ...event, activityId: event.id }) : event.name) || songDetails.get(event.id)?.name || published?.name || '未识别歌名';
    recap.songs.push({ name, start: event.start, end: event.end, ...(published ? { clips: [published.clip] } : {}) });
  }
  if (!songEvents.length) recap.songs = names(content.songs).map(name => ({ name }));
  for (const kind of ['game', 'watch']) {
    const key = kind === 'game' ? 'games' : 'watch';
    for (const event of events.filter(item => item.kind === kind && validRange(item))) {
      const published = publications.get(event.id);
      recap[key].push({ name: event.name || published?.name || (kind === 'game' ? '游戏片段' : '同步视听片段'), start: event.start, end: event.end, ...(published ? { clips: [published.clip] } : {}) });
    }
    for (const name of names(content[key])) if (!recap[key].some(item => normalize(item.name) === normalize(name))) recap[key].push({ name });
  }
  // Older content summaries describe the watched work in the overview/topics,
  // while their structured schema only has songs/games/topics fields.
  const topics = names(content.topics);
  for (const text of [recap.overview, ...topics]) {
    for (const match of text.matchAll(/(?:同步(?:观看|视听)|观看|观影|看电影|看番|看剧|看)[^《。；，、\n]{0,12}《([^》]+)》/g)) {
      const name = match[1];
      if (!recap.watch.some(item => normalize(item.name) === normalize(name))) recap.watch.push({ name });
    }
  }
  recap.other = topics.filter(topic => !recap.watch.some(item => topic.includes(`《${item.name}》`))).map(name => ({ name }));
  for (const game of games) {
    let item = recap.games.find(existing => normalize(existing.name) === normalize(game.name));
    if (!item) { item = { name: game.name }; recap.games.push(item); }
    item.clips ||= [];
    if (!item.clips.some(clip => clip.url === game.clip.url)) item.clips.push(game.clip);
  }
  for (const key of ['songs', 'games', 'watch', 'other']) recap[key] = uniqueItems(recap[key]);
  return recap;
}

export function collectRecapSources(sourceDirs) {
  const records = new Map();
  for (const root of sourceDirs) {
    if (!fs.existsSync(root)) continue;
    for (const date of fs.readdirSync(root, { withFileTypes: true })) {
      if (!date.isDirectory() || date.isSymbolicLink() || !/^\d{4}_\d{2}_\d{2}$/.test(date.name)) continue;
      const directory = path.join(root, date.name);
      for (const file of fs.readdirSync(directory)) {
        if (!/_LIVE_CONTENT\.json$/i.test(file)) continue;
        const artifact = parseStreamArtifact(file.replace(/_LIVE_CONTENT\.json$/i, '.flv'));
        if (!artifact) continue;
        const summaryFile = path.join(directory, file);
        const mtime = fs.statSync(summaryFile).mtimeMs;
        const previous = records.get(artifact.streamId);
        if (!previous || mtime > previous.mtime) records.set(artifact.streamId, { summaryFile, directory, mtime });
      }
    }
  }
  return records;
}

function findSessionPlan(dateDirectory, folder, streamId) {
  const root = path.join(dateDirectory, folder);
  let result;
  if (!fs.existsSync(root)) return result;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || parseStreamArtifact(`${entry.name}.flv`)?.streamId !== streamId) continue;
    const directory = path.join(root, entry.name);
    const file = path.join(directory, 'PLAN.json');
    if (!fs.existsSync(file)) continue;
    const plan = read(file);
    if (parseStreamArtifact(basename(plan.source?.mediaPath))?.streamId !== streamId) continue;
    const mtime = fs.statSync(file).mtimeMs;
    if (!result || mtime > result.mtime) result = { directory, plan, mtime };
  }
  return result;
}

// Scan summaries outside the incremental asset window too: historical streams
// can gain structured summaries or completed uploads at any time.
export function enrichStreamRecaps(streams, { sourceDirs, liverId }) {
  const records = collectRecapSources(sourceDirs);
  return streams.map(stream => {
    const record = records.get(stream.id);
    if (!record) return stream;
    let summary = read(record.summaryFile);
    const activity = findSessionPlan(record.directory, 'stream_activity_clips', stream.id);
    const game = findSessionPlan(record.directory, 'stream_game_clips', stream.id);
    const plan = activity?.plan;
    if (plan?.summary?.path) {
      let summaryFile;
      try {
        summaryFile = sessionPath(record.directory, plan.summary.path);
      } catch (error) {
        // Reviewed repairs may live outside the recording tree. Only accept the
        // exact JSON bytes bound into this plan, never an arbitrary external file.
        summaryFile = path.resolve(plan.summary.path);
        if (!/^[a-f0-9]{64}$/.test(plan.summary.sha256 || '')) throw error;
        if (fs.existsSync(summaryFile)
          && createHash('sha256').update(fs.readFileSync(summaryFile)).digest('hex') !== plan.summary.sha256) {
          throw new Error(`Reviewed summary checksum mismatch: ${summaryFile}`);
        }
      }
      // PLAN may use the recording's original summary or its reviewed SUMMARY.
      if (fs.existsSync(summaryFile)) summary = read(summaryFile);
    }
    const songsFile = activity && path.join(activity.directory, 'SONGS.json');
    const songRecord = songsFile && fs.existsSync(songsFile) ? read(songsFile) : undefined;
    const songs = songRecord?.sessionId === plan?.sessionId && songRecord?.sessionId ? songRecord : undefined;
    const songDetails = activity && liverId === 'sui' ? songDetailsFor(activity.directory, songs || {
      sessionId: plan.sessionId, source: plan.source,
      songs: (plan.events || []).filter(event => event.kind === 'song').map(event => ({ ...event, activityId: event.id })),
    }) : new Map();
    const publications = activity ? activityPublications(activity.directory, plan) : new Map();
    const games = game ? gamePublications(game.directory, game.plan) : [];
    const recap = buildStreamRecap(summary, { liverId, plan, songs, songDetails, publications, games });
    return recap ? { ...stream, recap } : stream;
  });
}

export function syncStreamRecaps({ liverId = 'sui', sourceDirs = getLiverConfig(liverId).sourceDirs, index = path.join(getIndexLiverDir(liverId), 'streams.json'), snapshot = false, output = snapshot ? path.resolve(`src/data/stream-recaps/${liverId}.json`) : index } = {}) {
  if (!sourceDirs.some(directory => fs.existsSync(directory))) throw new Error(`No recording sources are available for ${liverId}`);
  const streams = enrichStreamRecaps(read(index), { sourceDirs, liverId });
  const data = snapshot ? Object.fromEntries(streams.filter(stream => stream.recap).map(stream => [stream.id, stream.recap])) : streams;
  copyFileIfChanged(Buffer.from(`${JSON.stringify(data, null, 2)}\n`), output);
  console.log(`Stream recaps: ${streams.filter(stream => stream.recap).length} / ${streams.length} -> ${output}`);
  return streams;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  syncStreamRecaps({ liverId: args.includes('--liver') ? args[args.indexOf('--liver') + 1] : 'sui', snapshot: args.includes('--snapshot'), output: args.includes('--output') ? path.resolve(args[args.indexOf('--output') + 1]) : undefined });
}

import fs from 'fs';
import path from 'path';

export const RECENT_REFRESH_HOURS = 72;
export const INCOMPLETE_REFRESH_DAYS = 14;
export const IMAGE_FALLBACK_MAX_HOURS = 12;

const RECORDER_PREFIX = /^录制-\d+-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-\d+-(.+)$/i;
const DDTV5_PREFIX = /^(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})_(.+?)_DDTV5/i;

export function streamIdToDate(streamId) {
  const parts = streamId?.split('_').map(Number);
  if (!parts || parts.length !== 6 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2], parts[3], parts[4], parts[5]);
}

function classifyArtifact(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.speaker.srt')) return 'speaker-srt';
  if (lower.endsWith('.srt')) return 'srt';
  if (lower.endsWith('.xml')) return 'xml';
  if (lower.endsWith('.cover.jpg')) return 'cover';
  if (lower.endsWith('.flv') || lower.endsWith('.mp4')) return 'video';
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'highlights';
  if (/\.(png|jpe?g)$/i.test(lower)) return 'image';
  return null;
}

function stripArtifactSuffix(value) {
  let result = value
    .replace(/\.(speaker\.)?srt$/i, '')
    .replace(/\.(xml|flv|mp4|txt|md|png|jpe?g)$/i, '')
    .replace(/\.cover$/i, '');

  result = result
    .replace(/_merged(?:\.speaker)?$/i, '')
    .replace(/_merged_(?:AI_HIGHLIGHT|SUMMARY|总结|晚安回复|晚安|COMIC_FACTORY|COMIC_SCRIPT|SCREENSHOTS).*$/i, '')
    .replace(/_(?:AI_HIGHLIGHT|SUMMARY|总结|晚安回复|晚安|COMIC_FACTORY|COMIC_SCRIPT|SCREENSHOTS).*$/i, '');

  return result;
}

export function parseStreamArtifact(fileName) {
  const kind = classifyArtifact(fileName);
  if (!kind) return null;

  const recorderMatch = RECORDER_PREFIX.exec(fileName);
  if (recorderMatch) {
    const [, year, month, day, hour, minute, second, remainder] = recorderMatch;
    const streamId = `${year}_${month}_${day}_${hour}_${minute}_${second}`;
    return {
      streamId,
      startTime: streamIdToDate(streamId),
      title: stripArtifactSuffix(remainder),
      kind,
    };
  }

  const ddtvMatch = DDTV5_PREFIX.exec(fileName);
  if (ddtvMatch) {
    return {
      streamId: ddtvMatch[1],
      startTime: streamIdToDate(ddtvMatch[1]),
      title: stripArtifactSuffix(ddtvMatch[2]),
      kind,
    };
  }

  return null;
}

export function isEnrichmentIncomplete(stream) {
  return !stream?.xml
    || !stream?.cover
    || !stream?.srt
    || !stream?.highlights
    || !Array.isArray(stream?.images)
    || stream.images.length === 0;
}

export function getIncrementalRefreshStart(existingStreams, now = new Date()) {
  const recentStart = new Date(now.getTime() - RECENT_REFRESH_HOURS * 60 * 60 * 1000);
  const incompleteLimit = now.getTime() - INCOMPLETE_REFRESH_DAYS * 24 * 60 * 60 * 1000;
  let refreshStart = recentStart;

  for (const stream of existingStreams) {
    const streamTime = streamIdToDate(stream.id);
    if (!streamTime || streamTime.getTime() < incompleteLimit || !isEnrichmentIncomplete(stream)) continue;
    if (streamTime.getTime() < refreshStart.getTime()) refreshStart = streamTime;
  }

  return refreshStart;
}

export function shouldScanDateFolder(folderName, { mode, refreshStart, latestSyncedTime }) {
  if (mode === 'full') return true;
  const match = /^(\d{4})_(\d{2})_(\d{2})$/.exec(folderName);
  if (!match) return false;

  const folderStart = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const folderEnd = new Date(folderStart.getTime() + 24 * 60 * 60 * 1000);
  if (refreshStart && folderEnd.getTime() > refreshStart.getTime()) return true;
  return Boolean(latestSyncedTime && folderEnd.getTime() > latestSyncedTime.getTime());
}

export function readXmlDuration(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(/p="([\d.]+),/g);
    if (!matches?.length) return 0;
    const last = /p="([\d.]+),/.exec(matches[matches.length - 1]);
    return last ? Math.floor(Number(last[1])) : 0;
  } catch {
    return 0;
  }
}

export function choosePreferredArtifact(files, kind) {
  const candidates = files.filter((entry) => entry.artifact?.kind === kind);
  if (!candidates.length) return null;

  return candidates.sort((a, b) => {
    if (kind === 'xml' && a.duration !== b.duration) return b.duration - a.duration;
    const aMerged = /_merged\./i.test(a.file) ? 1 : 0;
    const bMerged = /_merged\./i.test(b.file) ? 1 : 0;
    if (aMerged !== bMerged) return bMerged - aMerged;
    return a.file.localeCompare(b.file);
  })[0];
}

export function choosePreferredSrt(files) {
  return choosePreferredArtifact(files, 'srt') || choosePreferredArtifact(files, 'speaker-srt');
}

export function copyFileIfChanged(sourcePath, targetPath) {
  const source = Buffer.isBuffer(sourcePath) ? sourcePath : fs.readFileSync(sourcePath);
  if (fs.existsSync(targetPath)) {
    const target = fs.readFileSync(targetPath);
    if (source.equals(target)) return false;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  if (Buffer.isBuffer(sourcePath)) fs.writeFileSync(targetPath, source);
  else fs.copyFileSync(sourcePath, targetPath);
  return true;
}

export function imageBelongsToStream(image, streamId) {
  return image.streamId === streamId;
}

export function isImageFallbackCandidate(image, stream, maxHours = IMAGE_FALLBACK_MAX_HOURS) {
  const imageDate = image.date || image.sourceDir?.match(/(\d{4}_\d{2}_\d{2})/)?.[1]?.replaceAll('_', '-');
  if (imageDate !== stream.date) return false;
  return Math.abs(image.mtime - stream.startTime.getTime()) <= maxHours * 60 * 60 * 1000;
}

export function mergeRefreshedStream(existing, refreshed) {
  if (!existing) return refreshed;
  return {
    ...existing,
    ...refreshed,
    srt: refreshed.srt || existing.srt || null,
    xml: refreshed.xml || existing.xml || null,
    cover: refreshed.cover || existing.cover || null,
    highlights: refreshed.highlights || existing.highlights || null,
    images: [...new Set(refreshed.images || [])],
  };
}

export function calculateOverlapRatio(stream1, stream2) {
  const start1 = stream1.startTime instanceof Date
    ? stream1.startTime.getTime()
    : streamIdToDate(stream1.id)?.getTime();
  const start2 = stream2.startTime instanceof Date
    ? stream2.startTime.getTime()
    : streamIdToDate(stream2.id)?.getTime();
  if (!Number.isFinite(start1) || !Number.isFinite(start2)) return 0;

  const end1 = start1 + Number(stream1.duration || 0) * 1000;
  const end2 = start2 + Number(stream2.duration || 0) * 1000;
  const overlap = Math.max(0, Math.min(end1, end2) - Math.max(start1, start2));
  const union = Math.max(end1, end2) - Math.min(start1, start2);
  return union > 0 ? overlap / union : 0;
}

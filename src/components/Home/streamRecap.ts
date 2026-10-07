export interface RecapItem {
  name: string;
  start?: number;
  end?: number;
  clips?: { bvid: string; part: number; url: string; title?: string }[];
}

export interface StreamRecap {
  overview: string;
  songs: RecapItem[];
  games: RecapItem[];
  watch: RecapItem[];
  other: RecapItem[];
  generatedAt?: string;
}

export function isStreamRecap(value: unknown): value is StreamRecap {
  if (!value || typeof value !== 'object') return false;
  const recap = value as StreamRecap;
  return typeof recap.overview === 'string'
    && ['songs', 'games', 'watch', 'other'].every(key => {
      const items = recap[key as 'songs' | 'games' | 'watch' | 'other'];
      return Array.isArray(items) && items.every(item => item && typeof item.name === 'string'
        && (item.start === undefined || (Number.isFinite(item.start) && item.start >= 0))
        && (item.end === undefined || (Number.isFinite(item.end) && item.end > (item.start ?? 0)))
        && (item.clips === undefined || (Array.isArray(item.clips) && item.clips.every(clip => clip && /^BV[0-9A-Za-z]{10}$/.test(clip.bvid)
          && Number.isInteger(clip.part) && clip.part > 0 && (clip.title === undefined || typeof clip.title === 'string')
          && clip.url === `https://www.bilibili.com/video/${clip.bvid}/?p=${clip.part}`))));
    }) && (recap.generatedAt === undefined || Number.isFinite(Date.parse(recap.generatedAt)));
}

export function chooseStreamRecap(remote: unknown, saved: unknown) {
  if (!isStreamRecap(remote)) return isStreamRecap(saved) ? saved : undefined;
  if (isStreamRecap(saved) && saved.generatedAt && remote.generatedAt
    && Date.parse(saved.generatedAt) > Date.parse(remote.generatedAt)) return saved;
  return remote;
}

type Section = 'summary' | 'goodnight' | 'highlights';

export function splitStreamText(markdown: string) {
  const sections: Record<Section, string[]> & { metadata: string[] } = { summary: [], goodnight: [], highlights: [], metadata: [] };
  const lines = markdown.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  let section: Section = 'summary';
  let buffer: string[] = [];
  let explicit = false;
  let fenced = false;
  const flush = () => {
    const text = buffer.join('\n').replace(/^(?:\s*---+\s*\n)+|(?:\n\s*---+\s*)+$/g, '').trim();
    if (text) {
      const greeting = `${text.slice(0, 300)}\n${text.slice(-400)}`;
      const kind = !explicit && section === 'summary' && /晚安|早点休息|辛苦小岁|小岁[^。\n]{0,30}(?:辛苦|休息)/.test(greeting) ? 'goodnight' : section;
      sections[kind].push(text);
    }
    buffer = [];
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (!fenced && /^---\s*$/.test(line) && /^\s*[\w-]+:/.test(lines[index + 1] || '')) {
      const end = lines.findIndex((candidate, offset) => offset > index && /^---\s*$/.test(candidate));
      if (end > index) {
        flush();
        const metadata = lines.slice(index + 1, end).join('\n');
        sections.metadata.push(metadata);
        if (/^sourceHighlight:/m.test(metadata)) { section = 'goodnight'; explicit = true; }
        index = end;
        continue;
      }
    }
    if (!fenced && /^\{"(?:format|kind)":/.test(line) && /"(?:immersive_v1|beat|reference)"/.test(line)) {
      flush();
      sections.metadata.push(lines.slice(index).join('\n').trim());
      break;
    }
    const heading = line.replace(/^#{1,6}\s+/, '').replace(/\s*#+$/, '').trim();
    let next: Section | undefined;
    if (/^(?:直播梗概|本场梗概|梗概|直播总结|直播内容总结|内容概览|本场摘要|summary)$/i.test(heading)) next = 'summary';
    if (/^(?:晚安回复|晚安评论|goodnight(?: reply)?)$/i.test(heading)) next = 'goodnight';
    if (/^(?:AI\s*)?highlights?$/i.test(heading) || /^【(?:摘要|高能浓缩摘要)】/.test(line) || /^\[\d+(?:h|m|s)\]/.test(line)) next = 'highlights';
    if (next && (section !== next || !explicit || /^#/.test(line))) {
      flush(); section = next; explicit = true;
      if (/^#/.test(line) || /^(?:直播梗概|梗概|晚安回复|晚安评论|(?:AI\s*)?highlights?)$/i.test(heading)) continue;
    }
    // The generated timeline uses tight dashed separators, which Markdown
    // otherwise treats as setext headings for the preceding transcript block.
    if (!fenced && section === 'highlights' && /^-{3,}\s*$/.test(line)) {
      buffer.push('', line, '');
      continue;
    }
    buffer.push(line);
  }
  flush();
  return { summary: sections.summary.join('\n\n'), goodnight: sections.goodnight.join('\n\n'), highlights: sections.highlights.join('\n\n'), metadata: sections.metadata };
}

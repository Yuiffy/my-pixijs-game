import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const SOURCE_BASE_DIRS = [
  'D:/files/videos/DDTV录播/25788785_岁己SUI',
  'E:/EFiles/Evideo/DDTV录播-E/25788785_岁己SUI'
];
const TARGET_BASE_DIR = path.join(ROOT_DIR, 'public/data/streams');

const FILENAME_REGEX_DDTV5 = /^(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})_(.*)_DDTV5/;
const FILENAME_REGEX_LUZHI = /^录制-\d+-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-\d+-(.*)\.(xml|flv|mp4|cover\.jpg)/;

if (!fs.existsSync(TARGET_BASE_DIR)) {
  fs.mkdirSync(TARGET_BASE_DIR, { recursive: true });
}

async function syncStreams() {
  const allStreams = [];
  const allStreamGroups = {};
  const allPotentialTitles = [];

  for (const sourceDir of SOURCE_BASE_DIRS) {
    if (!fs.existsSync(sourceDir)) {
      console.warn(`Source directory not found: ${sourceDir}`);
      continue;
    }

    const dateFolders = fs.readdirSync(sourceDir).filter(f => {
      const fullPath = path.join(sourceDir, f);
      return fs.statSync(fullPath).isDirectory() && f.match(/^\d{4}_\d{2}_\d{2}$/);
    });

    for (const dateFolder of dateFolders) {
      const fullSourcePath = path.join(sourceDir, dateFolder);
      const files = fs.readdirSync(fullSourcePath);

      // 1. First Pass: Collect all files and potential titles
      files.forEach(file => {
        const fullPath = path.join(fullSourcePath, file);
        const stats = fs.statSync(fullPath);

        const ddtvMatch = file.match(FILENAME_REGEX_DDTV5);
        const recorderMatch = file.match(FILENAME_REGEX_LUZHI);

        let timestamp = null;
        let title = null;

        if (ddtvMatch) {
          const [Y, M, D, h, m, s] = ddtvMatch[1].split('_').map(Number);
          timestamp = new Date(Y, M - 1, D, h, m, s);
          title = ddtvMatch[2];
        } else if (recorderMatch) {
          const [_, Y, M, D, h, m, s, t] = recorderMatch;
          timestamp = new Date(Number(Y), Number(M) - 1, Number(D), Number(h), Number(m), Number(s));
          title = t;
        }

        if (timestamp && title && !title.includes('摸鱼茶水间') && !title.includes('无题')) { // Skip default placeholders if possible
           allPotentialTitles.push({ timestamp, title, mtime: stats.mtimeMs });
        }
      });

      // Done collecting titles for this folder

      // 2. Second Pass: Group files by stream prefix (YYYY_MM_DD_HH_mm_ss)
      files.forEach(file => {
        const fullPath = path.join(fullSourcePath, file);
        const stats = fs.statSync(fullPath);

        const ddtvMatch = file.match(FILENAME_REGEX_DDTV5);
        const recorderMatch = file.match(FILENAME_REGEX_LUZHI);

        let dateTimeStr = null;
        let titlePart = null;
        let startTime = null;

        if (ddtvMatch) {
          dateTimeStr = ddtvMatch[1];
          titlePart = ddtvMatch[2];
          const [Y, M, D, h, m, s] = dateTimeStr.split('_').map(Number);
          startTime = new Date(Y, M - 1, D, h, m, s);
        } else if (recorderMatch) {
          const [_, Y, M, D, h, m, s, t] = recorderMatch;
          dateTimeStr = `${Y}_${M}_${D}_${h}_${m}_${s}`;
          titlePart = t;
          startTime = new Date(Number(Y), Number(M) - 1, Number(D), Number(h), Number(m), Number(s));
        }

        if (dateTimeStr) {
          if (!allStreamGroups[dateTimeStr]) {
            allStreamGroups[dateTimeStr] = {
              id: dateTimeStr,
              startTime: startTime,
              title: titlePart,
              date: startTime.toISOString().split('T')[0],
              time: startTime.toTimeString().split(' ')[0],
              files: [],
              otherImages: [],
              duration: 0
            };
          }

          allStreamGroups[dateTimeStr].files.push({ file: file, sourceDir: fullSourcePath });

          if (file.endsWith('.xml')) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const pMatches = content.match(/p="([^"]+)"/g);
              if (pMatches && pMatches.length > 0) {
                const lastP = pMatches[pMatches.length - 1];
                const timeMatch = lastP.match(/p="([\d.]+),/);
                if (timeMatch) {
                  const duration = Math.floor(parseFloat(timeMatch[1]));
                  if (duration > allStreamGroups[dateTimeStr].duration) {
                    allStreamGroups[dateTimeStr].duration = duration;
                  }
                }
              }
            } catch (e) { /* ignore errors reading xml */ }
          }
        }
      });
    }
  }

  // Merge close groups (deduplication across all collected groups)
  const sortedKeys = Object.keys(allStreamGroups).sort((a, b) => allStreamGroups[a].startTime - allStreamGroups[b].startTime);
  const mergedStreamGroups = {};

  sortedKeys.forEach(key => {
    const current = allStreamGroups[key];
    let merged = false;
    for (const mKey in mergedStreamGroups) {
      const existing = mergedStreamGroups[mKey];
      // If within 10 minutes, merge
      if (Math.abs(current.startTime.getTime() - existing.startTime.getTime()) < 10 * 60 * 1000) {
        existing.files.push(...current.files);
        if (current.duration > existing.duration) existing.duration = current.duration;
        // Keep the earliest startTime/ID as the anchor
        if (current.startTime.getTime() < existing.startTime.getTime()) {
          existing.startTime = current.startTime;
          existing.id = current.id;
          existing.date = current.date;
          existing.time = current.time;
        }
        merged = true;
        break;
      }
    }
    if (!merged) {
      mergedStreamGroups[key] = current;
    }
  });

  const finalStreamGroups = mergedStreamGroups;
  const validStreamIds = Object.keys(finalStreamGroups)
    .filter(id => finalStreamGroups[id].duration >= 60)
    .sort();

  // 3. Third Pass: Refine titles for valid streams
  allPotentialTitles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()); // Sort all titles once

  validStreamIds.forEach((id, index) => {
    const stream = finalStreamGroups[id];
    const nextStreamStart = validStreamIds[index + 1] ? finalStreamGroups[validStreamIds[index + 1]].startTime : new Date(stream.startTime.getTime() + 24 * 3600 * 1000);

    // Find all titles that appeared between this stream and the next
    // Or titles that are very close to the start (within 5 mins before)
    const windowTitles = allPotentialTitles.filter(t => {
      const tTime = t.timestamp.getTime();
      const startTime = stream.startTime.getTime();
      return (tTime >= startTime - 5 * 60 * 1000) && (tTime < nextStreamStart.getTime());
    });

    if (windowTitles.length > 0) {
      // Pick the latest title in this window, it's likely the most accurate
      windowTitles.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      stream.title = windowTitles[0].title;
    }
  });

  // Process each final stream group
  for (const streamId of validStreamIds) {
    const stream = finalStreamGroups[streamId];
    const targetDir = path.join(TARGET_BASE_DIR, streamId);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const streamData = {
      id: stream.id,
      title: stream.title,
      date: stream.date,
      time: stream.time,
      startTime: stream.time, // This will be overwritten below
      endTime: null,
      duration: stream.duration,
      durationStr: null,
      srt: null,
      xml: null,
      cover: null,
      highlights: null,
      images: []
    };

    const hours = stream.duration / 3600;
    streamData.durationStr = hours >= 0.1 ? `${hours.toFixed(1)} 小时` : `${Math.floor(stream.duration / 60)} 分钟`;

    const [h, m] = stream.time.split(':').map(Number);
    const startDate = new Date(2000, 0, 1, h, m, 0); // Dummy date for time calculation
    const endDate = new Date(startDate.getTime() + stream.duration * 1000);

    streamData.startTime = stream.time.split(':').slice(0, 2).join(':');
    streamData.endTime = endDate.toTimeString().split(' ')[0].split(':').slice(0, 2).join(':');

    // Collect all images from all source dirs related to this merged stream
    const relatedSourceDirs = [...new Set(stream.files.map(f => f.sourceDir))];
    const allSummaryImages = [];
    relatedSourceDirs.forEach(sourceDir => {
      if (!fs.existsSync(sourceDir)) return; // Ensure sourceDir still exists
      const filesInSourceDir = fs.readdirSync(sourceDir);
      filesInSourceDir.forEach(file => {
        if (file.match(/\.(png|jpg|jpeg|PNG|JPG|JPEG)$/)) {
          if (file.includes('cover')) return;
          const fullPath = path.join(sourceDir, file);
          try {
            allSummaryImages.push({
              name: file,
              fullPath: fullPath,
              mtime: fs.statSync(fullPath).mtimeMs
            });
          } catch (e) {
            console.warn(`Could not stat file ${fullPath}: ${e.message}`);
          }
        }
      });
    });

    allSummaryImages.sort((a, b) => b.mtime - a.mtime);
    // Take a few images as variety
    const imagesToCopy = allSummaryImages.slice(0, 5);

    stream.files.forEach(({ file, sourceDir }) => {
      const ext = path.extname(file).toLowerCase();
      const targetPath = path.join(targetDir, file);
      const fullSourcePath = path.join(sourceDir, file);

      if (!fs.existsSync(fullSourcePath)) {
        console.warn(`Source file not found: ${fullSourcePath}, skipping.`);
        return;
      }

      if (ext === '.srt') {
        if (!fs.existsSync(targetPath)) fs.copyFileSync(fullSourcePath, targetPath);
        streamData.srt = `/data/streams/${streamId}/${file}`;
      } else if (ext === '.xml') {
        if (!fs.existsSync(targetPath)) fs.copyFileSync(fullSourcePath, targetPath);
        streamData.xml = `/data/streams/${streamId}/${file}`;
      } else if (file.includes('cover')) {
        if (!fs.existsSync(targetPath)) fs.copyFileSync(fullSourcePath, targetPath);
        streamData.cover = `/data/streams/${streamId}/${file}`;
      } else if (file.includes('AI_HIGHLIGHT')) {
        const content = fs.readFileSync(fullSourcePath, 'utf-8');
        streamData.highlights = content;
      }
    });

    imagesToCopy.forEach(img => {
      const targetPath = path.join(targetDir, img.name);
      if (!fs.existsSync(targetPath)) {
        if (fs.existsSync(img.fullPath)) {
          fs.copyFileSync(img.fullPath, targetPath);
        } else {
          console.warn(`Image file not found: ${img.fullPath}, skipping.`);
          return;
        }
      }
      streamData.images.push(`/data/streams/${streamId}/${img.name}`);
    });

    // Ensure highlights are picked up if not already
    if (!streamData.highlights) {
      const highlightFile = stream.files.find(f => f.file.includes('AI_HIGHLIGHT'));
      if (highlightFile) {
         if (fs.existsSync(path.join(highlightFile.sourceDir, highlightFile.file))) {
            streamData.highlights = fs.readFileSync(path.join(highlightFile.sourceDir, highlightFile.file), 'utf-8');
         }
      }
    }

    allStreams.push(streamData);
  }

  allStreams.sort((a, b) => b.id.localeCompare(a.id));

  fs.writeFileSync(
    path.join(TARGET_BASE_DIR, 'streams.json'),
    JSON.stringify(allStreams, null, 2)
  );

  console.log(`Synced ${allStreams.length} valid streams with distributed images.`);
}

syncStreams().catch(console.error);

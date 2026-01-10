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

if (!fs.existsSync(TARGET_BASE_DIR)) {
  fs.mkdirSync(TARGET_BASE_DIR, { recursive: true });
}

async function syncStreams() {
  const allStreams = [];

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
      const potentialTitles = []; // { timestamp: Date, title: string }

      files.forEach(file => {
        const fullPath = path.join(fullSourcePath, file);
        const stats = fs.statSync(fullPath);

        // Format 1: 2026_01_05_20_03_09_TITLE_DDTV5...
        const ddtvMatch = file.match(/^(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})_(.*)_DDTV5/);
        // Format 2: 录制-25788785-20260105-200301-648-TITLE.xml
        const recorderMatch = file.match(/^录制-\d+-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-\d+-(.*)\.(xml|flv|mp4|cover\.jpg)/);

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

        if (timestamp && title && !title.includes('摸鱼茶水间')) { // Skip default placeholders if possible
           potentialTitles.push({ timestamp, title, mtime: stats.mtimeMs });
        }
      });

      // Sort titles by timestamp
      potentialTitles.sort((a, b) => a.timestamp - b.timestamp);

      // 2. Second Pass: Group files by stream prefix (YYYY_MM_DD_HH_mm_ss)
      const streamGroups = {};

      files.forEach(file => {
        const match = file.match(/^(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})_(.*)_DDTV5/) ||
                      file.match(/^录制-\d+-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-\d+-(.*)\.(xml|flv|mp4|cover\.jpg)/);

        let dateTimeStr = null;
        let titlePart = null;

        if (match) {
          if (match[0].startsWith('录制')) {
             dateTimeStr = `${match[1]}_${match[2]}_${match[3]}_${match[4]}_${match[5]}_${match[6]}`;
             titlePart = match[7];
          } else {
             dateTimeStr = match[1];
             titlePart = match[2];
          }

          const fullPath = path.join(fullSourcePath, file);
          const stats = fs.statSync(fullPath);

          if (!streamGroups[dateTimeStr]) {
            const [Y, M, D, h, m, s] = dateTimeStr.split('_').map(Number);
            streamGroups[dateTimeStr] = {
              id: dateTimeStr,
              startTime: new Date(Y, M - 1, D, h, m, s),
              title: titlePart,
              latestTitleMtime: stats.mtimeMs,
              date: dateFolder.replace(/_/g, '-'),
              time: dateTimeStr.split('_').slice(3).join(':'),
              files: [],
              otherImages: [],
              duration: 0
            };
          }

          streamGroups[dateTimeStr].files.push(file);

          if (file.endsWith('.xml')) {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              const pMatches = content.match(/p="([^"]+)"/g);
              if (pMatches && pMatches.length > 0) {
                const lastP = pMatches[pMatches.length - 1];
                const timeMatch = lastP.match(/p="([\d.]+),/);
                if (timeMatch) {
                  const duration = Math.floor(parseFloat(timeMatch[1]));
                  if (duration > streamGroups[dateTimeStr].duration) {
                    streamGroups[dateTimeStr].duration = duration;
                  }
                }
              }
            } catch (e) {}
          }
        }
      });

      const validStreamIds = Object.keys(streamGroups)
        .filter(id => streamGroups[id].duration >= 60)
        .sort();

      // 3. Third Pass: Refine titles for valid streams
      validStreamIds.forEach((id, index) => {
        const stream = streamGroups[id];
        const nextStreamStart = validStreamIds[index + 1] ? streamGroups[validStreamIds[index + 1]].startTime : new Date(stream.startTime.getTime() + 24 * 3600 * 1000);

        // Find all titles that appeared between this stream and the next
        // Or titles that are very close to the start (within 5 mins before)
        const windowTitles = potentialTitles.filter(t => {
          const tTime = t.timestamp.getTime();
          const startTime = stream.startTime.getTime();
          return (tTime >= startTime - 5 * 60 * 1000) && (tTime < nextStreamStart.getTime());
        });

        if (windowTitles.length > 0) {
          // Pick the latest title in this window, it's likely the most accurate
          windowTitles.sort((a, b) => b.timestamp - a.timestamp);
          stream.title = windowTitles[0].title;
        }
      });

      const allSummaryImages = [];
      files.forEach(file => {
        if (file.match(/\.(png|jpg|jpeg|PNG|JPG|JPEG)$/)) {
          if (file.includes('cover')) return;
          const fullPath = path.join(fullSourcePath, file);
          allSummaryImages.push({
            name: file,
            mtime: fs.statSync(fullPath).mtimeMs
          });
        }
      });

      allSummaryImages.sort((a, b) => b.mtime - a.mtime);

      if (validStreamIds.length > 0) {
        if (validStreamIds.length === 1) {
          streamGroups[validStreamIds[0]].otherImages.push(...allSummaryImages.map(img => img.name));
        } else {
          allSummaryImages.forEach((img, index) => {
            const streamIndex = index % validStreamIds.length;
            streamGroups[validStreamIds[streamIndex]].otherImages.push(img.name);
          });
        }
      }

      for (const streamId of validStreamIds) {
        const stream = streamGroups[streamId];
        const targetDir = path.join(TARGET_BASE_DIR, streamId);
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const streamData = {
          id: stream.id,
          title: stream.title,
          date: stream.date,
          time: stream.time,
          startTime: stream.time,
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
        const startDate = new Date(2000, 0, 1, h, m, 0);
        const endDate = new Date(startDate.getTime() + stream.duration * 1000);

        streamData.startTime = stream.time.split(':').slice(0, 2).join(':');
        streamData.endTime = endDate.toTimeString().split(' ')[0].split(':').slice(0, 2).join(':');

        stream.files.forEach(file => {
          const ext = path.extname(file).toLowerCase();
          const targetPath = path.join(targetDir, file);

          if (ext === '.srt') {
            fs.copyFileSync(path.join(fullSourcePath, file), targetPath);
            streamData.srt = `/data/streams/${streamId}/${file}`;
          } else if (ext === '.xml') {
            fs.copyFileSync(path.join(fullSourcePath, file), targetPath);
            streamData.xml = `/data/streams/${streamId}/${file}`;
          } else if (file.includes('cover')) {
            fs.copyFileSync(path.join(fullSourcePath, file), targetPath);
            streamData.cover = `/data/streams/${streamId}/${file}`;
          } else if (file.includes('AI_HIGHLIGHT')) {
            const content = fs.readFileSync(path.join(fullSourcePath, file), 'utf-8');
            streamData.highlights = content;
          }
        });

        stream.otherImages.forEach(file => {
          const targetPath = path.join(targetDir, file);
          if (fs.existsSync(path.join(fullSourcePath, file))) {
            fs.copyFileSync(path.join(fullSourcePath, file), targetPath);
            streamData.images.push(`/data/streams/${streamId}/${file}`);
          }
        });

        if (!streamData.highlights) {
          const highlightFile = stream.files.find(f => f.includes('AI_HIGHLIGHT'));
          if (highlightFile) {
             streamData.highlights = fs.readFileSync(path.join(fullSourcePath, highlightFile), 'utf-8');
          }
        }

        allStreams.push(streamData);
      }
    }
  }

  allStreams.sort((a, b) => b.id.localeCompare(a.id));

  fs.writeFileSync(
    path.join(TARGET_BASE_DIR, 'streams.json'),
    JSON.stringify(allStreams, null, 2)
  );

  console.log(`Synced ${allStreams.length} valid streams with distributed images.`);
}

syncStreams().catch(console.error);

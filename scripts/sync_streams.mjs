import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const SOURCE_BASE_DIR = 'D:/files/videos/DDTV录播/25788785_岁己SUI';
const TARGET_BASE_DIR = path.join(ROOT_DIR, 'public/data/streams');

if (!fs.existsSync(TARGET_BASE_DIR)) {
  fs.mkdirSync(TARGET_BASE_DIR, { recursive: true });
}

async function syncStreams() {
  const dateFolders = fs.readdirSync(SOURCE_BASE_DIR).filter(f => {
    return fs.statSync(path.join(SOURCE_BASE_DIR, f)).isDirectory() && f.match(/^\d{4}_\d{2}_\d{2}$/);
  });

  const allStreams = [];

  for (const dateFolder of dateFolders) {
    const fullSourcePath = path.join(SOURCE_BASE_DIR, dateFolder);
    const files = fs.readdirSync(fullSourcePath);

    // Group files by stream prefix (YYYY_MM_DD_HH_mm_ss)
    const streamGroups = {};

    files.forEach(file => {
      const match = file.match(/^(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})_(.*)_DDTV5/);
      if (match) {
        const dateTimeStr = match[1];
        const titlePart = match[2];
        if (!streamGroups[dateTimeStr]) {
          streamGroups[dateTimeStr] = {
            id: dateTimeStr,
            title: titlePart,
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
            const content = fs.readFileSync(path.join(fullSourcePath, file), 'utf-8');
            const pMatches = content.match(/p="([^"]+)"/g);
            if (pMatches && pMatches.length > 0) {
              const lastP = pMatches[pMatches.length - 1];
              const timeMatch = lastP.match(/p="([\d.]+),/);
              if (timeMatch) {
                streamGroups[dateTimeStr].duration = Math.floor(parseFloat(timeMatch[1]));
              }
            }
          } catch (e) {}
        }
      }
    });

    const validStreamIds = Object.keys(streamGroups)
      .filter(id => streamGroups[id].duration >= 60)
      .sort(); // Sort by time

    const allSummaryImages = [];
    files.forEach(file => {
      if (file.match(/\.(png|jpg|jpeg|PNG|JPG|JPEG)$/)) {
        if (file.includes('cover')) return;
        allSummaryImages.push(file);
      }
    });

    // Distribute images among valid streams
    if (validStreamIds.length > 0) {
      if (validStreamIds.length === 1) {
        streamGroups[validStreamIds[0]].otherImages.push(...allSummaryImages);
      } else {
        // Try to distribute. If images contain timestamps, match them.
        // Otherwise, split them by order.
        allSummaryImages.sort().forEach((file, index) => {
          const streamIndex = index % validStreamIds.length;
          streamGroups[validStreamIds[streamIndex]].otherImages.push(file);
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

  allStreams.sort((a, b) => b.id.localeCompare(a.id));

  fs.writeFileSync(
    path.join(TARGET_BASE_DIR, 'streams.json'),
    JSON.stringify(allStreams, null, 2)
  );

  console.log(`Synced ${allStreams.length} valid streams with distributed images.`);
}

syncStreams().catch(console.error);

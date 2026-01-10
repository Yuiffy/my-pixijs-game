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
            otherImages: []
          };
        }
        streamGroups[dateTimeStr].files.push(file);
      } else if (file.match(/\.(png|jpg|jpeg|PNG|JPG|JPEG)$/) && !file.includes('cover')) {
        // Find the nearest stream or just collect all images in the folder
        // For simplicity, we'll associate images with the largest/first stream in the same folder if not clearly prefixed
      }
    });

    // Second pass for images that might be summary illustrations
    files.forEach(file => {
      if (file.match(/\.(png|jpg|jpeg|PNG|JPG|JPEG)$/)) {
        if (file.includes('cover')) return;

        // If it's a specific summary image like Gemini_XXX or 图片文字替换
        if (file.includes('Gemini') || file.includes('图片文字替换') || !file.match(/^\d{4}/)) {
           // Assign to the last stream found in this folder (usually there is only one or we pick the first)
           const streamIds = Object.keys(streamGroups);
           if (streamIds.length > 0) {
             streamGroups[streamIds[0]].otherImages.push(file);
           }
        }
      }
    });

    for (const streamId in streamGroups) {
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
        duration: null,
        srt: null,
        xml: null,
        cover: null,
        highlights: null,
        images: []
      };

      stream.files.forEach(file => {
        const ext = path.extname(file).toLowerCase();
        const targetPath = path.join(targetDir, file);

        if (ext === '.srt') {
          fs.copyFileSync(path.join(fullSourcePath, file), targetPath);
          streamData.srt = `/data/streams/${streamId}/${file}`;
        } else if (ext === '.xml') {
          fs.copyFileSync(path.join(fullSourcePath, file), targetPath);
          streamData.xml = `/data/streams/${streamId}/${file}`;

          // Partial XML parsing for duration
          try {
            const content = fs.readFileSync(path.join(fullSourcePath, file), 'utf-8');
            const pMatches = content.match(/p="([^"]+)"/g);
            if (pMatches && pMatches.length > 0) {
              const lastP = pMatches[pMatches.length - 1];
              const timeMatch = lastP.match(/p="([\d.]+),/);
              if (timeMatch) {
                const durationSec = parseFloat(timeMatch[1]);
                streamData.duration = Math.floor(durationSec);

                // Calculate end time
                const [h, m, s] = stream.time.split(':').map(Number);
                const startDate = new Date(2000, 0, 1, h, m, s);
                const endDate = new Date(startDate.getTime() + durationSec * 1000);
                streamData.endTime = endDate.toTimeString().split(' ')[0];

                // Format duration
                const dH = Math.floor(durationSec / 3600);
                const dM = Math.floor((durationSec % 3600) / 60);
                const dS = Math.floor(durationSec % 60);
                streamData.durationStr = dH > 0 ? `${dH}h ${dM}m ${dS}s` : `${dM}m ${dS}s`;
              }
            }
          } catch (err) {
            console.error(`Failed to parse XML for duration: ${file}`, err);
          }
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
        fs.copyFileSync(path.join(fullSourcePath, file), targetPath);
        streamData.images.push(`/data/streams/${streamId}/${file}`);
      });

      // Look for AI Summary text in grouped files if not found by ext
      if (!streamData.highlights) {
        const highlightFile = stream.files.find(f => f.includes('AI_HIGHLIGHT'));
        if (highlightFile) {
           streamData.highlights = fs.readFileSync(path.join(fullSourcePath, highlightFile), 'utf-8');
        }
      }

      allStreams.push(streamData);
    }
  }

  // Sort by date/time descending
  allStreams.sort((a, b) => b.id.localeCompare(a.id));

  fs.writeFileSync(
    path.join(TARGET_BASE_DIR, 'streams.json'),
    JSON.stringify(allStreams, null, 2)
  );

  console.log(`Synced ${allStreams.length} streams to ${TARGET_BASE_DIR}`);
}

syncStreams().catch(console.error);

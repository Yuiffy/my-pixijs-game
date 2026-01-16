import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { liverConfigs, getLiverConfig, getAllLiverIds } from './liver-config.js';

/**
 * 多主播同步脚本
 * 支持同步多个主播的直播数据
 *
 * 可选参数：
 * --liver [id]: 指定要同步的主播ID
 * --all: 同步所有主播
 * --full: 启用全量处理模式
 * --force: 强制重新处理所有数据
 *
 * 使用示例：
 * node sync_livers.mjs --liver sui
 * node sync_livers.mjs --all
 * node sync_livers.mjs --liver sui --full
 * node sync_livers.mjs --all --full
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const TARGET_BASE_DIR = path.join(ROOT_DIR, 'public/data/streams');

const FILENAME_REGEX_DDTV5 = /^(\d{4}_\d{2}_\d{2}_\d{2}_\d{2}_\d{2})_(.*)_DDTV5/;
const FILENAME_REGEX_LUZHI = /^录制-\d+-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-\d+-(.*)\.(xml|flv|mp4|cover\.jpg|txt|md)/;

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const mode = args.includes('--full') ? 'full' : 'incremental';
  const force = args.includes('--force');
  let liverId = null;
  const liverIndex = args.indexOf('--liver');
  if (liverIndex !== -1 && args[liverIndex + 1]) {
    liverId = args[liverIndex + 1];
  }
  const syncAll = args.includes('--all');
  return { mode, force, liverId, syncAll };
}

// 获取指定主播的最新已同步直播的时间戳
function getLatestSyncedTimestamp(targetDir) {
  const streamsJsonPath = path.join(targetDir, 'streams.json');
  if (!fs.existsSync(streamsJsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(streamsJsonPath, 'utf-8');
    const streams = JSON.parse(content);
    if (streams.length === 0) {
      return null;
    }

    const latestStream = streams.reduce((latest, current) => {
      return current.id > latest.id ? current : latest;
    });

    const [Y, M, D, h, m, s] = latestStream.id.split('_').map(Number);
    return new Date(Y, M - 1, D, h, m, s);
  } catch (error) {
    console.warn(`无法读取streams.json: ${error.message}`);
    return null;
  }
}

// 处理单个主播的数据
async function processLiver(liverConfig, mode, force, allFinalStreams) {
  const { id, name, sourceDirs, targetDir } = liverConfig;
  console.log(`\n=== 开始处理主播: ${name} (${id}) ===`);

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const latestSyncedTime = mode === 'incremental' ? getLatestSyncedTimestamp(targetDir) : null;
  if (mode === 'incremental' && latestSyncedTime) {
    console.log(`增量处理: 从 ${latestSyncedTime.toISOString()} 之后的数据开始处理`);
  } else if (mode === 'incremental' && !latestSyncedTime) {
    console.log('增量处理: 未找到已同步数据，将执行全量处理');
  }

  // 加载现有的streams数据（用于增量模式合并）
  let existingStreams = [];
  const streamsJsonPath = path.join(targetDir, 'streams.json');
  if (fs.existsSync(streamsJsonPath)) {
    try {
      const content = fs.readFileSync(streamsJsonPath, 'utf-8');
      existingStreams = JSON.parse(content);
      console.log(`已加载 ${existingStreams.length} 个现有直播数据`);
    } catch (error) {
      console.warn(`无法读取现有streams.json: ${error.message}`);
    }
  }

  const allStreams = [];
  const allStreamGroups = {};
  const allPotentialTitles = [];
  const allImages = [];

  for (const sourceDir of sourceDirs) {
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

        // 增量模式过滤：只处理晚于最新同步时间的文件
        if (mode === 'incremental' && latestSyncedTime && timestamp) {
          if (timestamp.getTime() <= latestSyncedTime.getTime()) {
            return; // 跳过旧文件
          }
        }

        if (timestamp && title && !title.includes('摸鱼茶水间') && !title.includes('无题')) {
          allPotentialTitles.push({ timestamp, title, mtime: stats.mtimeMs });
        }
      });

      // Collect all images in this folder
      const collectImages = (dir) => {
        const files = fs.readdirSync(dir);
        files.forEach(file => {
          const fullPath = path.join(dir, file);
          try {
            const stats = fs.statSync(fullPath);
            if (stats.isDirectory()) {
              collectImages(fullPath);
            } else if (file.match(/\.(png|jpg|jpeg|PNG|JPG|JPEG)$/)) {
              if (!file.includes('cover')) {
                // 增量模式过滤：只收集修改时间晚于最新同步时间的图片
                if (mode === 'incremental' && latestSyncedTime) {
                  if (stats.mtimeMs <= latestSyncedTime.getTime()) {
                    return; // 跳过旧图片
                  }
                }

                const existingIndex = allImages.findIndex(img => img.name === file && img.sourceDir === dir);
                if (existingIndex >= 0) {
                  allImages[existingIndex].mtime = stats.mtimeMs;
                  allImages[existingIndex].assigned = false;
                } else {
                  allImages.push({
                    name: file,
                    fullPath: fullPath,
                    mtime: stats.mtimeMs,
                    sourceDir: dir,
                    assigned: false
                  });
                }
              }
            }
          } catch (e) {
            console.warn(`Could not stat file ${fullPath}: ${e.message}`);
          }
        });
      };
      collectImages(fullSourcePath);

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

        // 增量模式过滤：只处理晚于最新同步时间的直播
        if (mode === 'incremental' && latestSyncedTime && startTime) {
          if (startTime.getTime() <= latestSyncedTime.getTime()) {
            return; // 跳过旧直播
          }
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

  console.log(`\n=== 去重检测 ===`);
  console.log(`检测到 ${sortedKeys.length} 个原始直播组`);

  sortedKeys.forEach(key => {
    const current = allStreamGroups[key];
    let merged = false;
    for (const mKey in mergedStreamGroups) {
      const existing = mergedStreamGroups[mKey];
      const timeDiff = Math.abs(current.startTime.getTime() - existing.startTime.getTime());
      if (timeDiff < 10 * 60 * 1000) {
        console.log(`合并直播组: ${key} (${current.startTime.toISOString()}) -> ${mKey} (${existing.startTime.toISOString()}), 时间差: ${timeDiff/1000}秒`);
        existing.files.push(...current.files);
        if (current.duration > existing.duration) existing.duration = current.duration;
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

  console.log(`去重后剩余 ${Object.keys(mergedStreamGroups).length} 个直播组`);

  const finalStreamGroups = mergedStreamGroups;
  const validStreamIds = Object.keys(finalStreamGroups)
    .filter(id => finalStreamGroups[id].duration >= 60)
    .sort();

  // Reset all image assignment status before processing streams
  console.log(`\n=== Resetting image assignment status ===`);
  console.log(`Total images before reset: ${allImages.length}`);
  let resetCount = 0;
  allImages.forEach(img => {
    if (img.assigned) {
      resetCount++;
    }
    img.assigned = false;
  });
  console.log(`Reset ${resetCount} previously assigned images`);

  // 3. Third Pass: Refine titles for valid streams
  allPotentialTitles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  validStreamIds.forEach((id, index) => {
    const stream = finalStreamGroups[id];
    const nextStreamStart = validStreamIds[index + 1] ? finalStreamGroups[validStreamIds[index + 1]].startTime : new Date(stream.startTime.getTime() + 24 * 3600 * 1000);

    const windowTitles = allPotentialTitles.filter(t => {
      const tTime = t.timestamp.getTime();
      const startTime = stream.startTime.getTime();
      return (tTime >= startTime - 5 * 60 * 1000) && (tTime < nextStreamStart.getTime());
    });

    if (windowTitles.length > 0) {
      windowTitles.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      stream.title = windowTitles[0].title;
    }
  });

  // Process each final stream group
  validStreamIds.forEach((streamId, index) => {
    const stream = finalStreamGroups[streamId];
    const streamTargetDir = path.join(targetDir, streamId);
    if (!fs.existsSync(streamTargetDir)) fs.mkdirSync(streamTargetDir, { recursive: true });

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

    // Assign images to this stream
    const maxImagesPerStream = 5;
    let maxImagesForThisStream = maxImagesPerStream;

    // 1. Filename matching - more flexible matching
    stream.files.forEach(({ file }) => {
      const videoBase = path.parse(file).name;
      const datePart = streamId.substring(0, 10);

      allImages.forEach(img => {
        if (streamData.images.length >= maxImagesForThisStream) {
          return;
        }

        const exactMatch = img.name.startsWith(streamId) || img.name.startsWith(videoBase);
        const containsDate = img.name.includes(datePart);
        const cleanVideoBase = videoBase.replace(/_DDTV5.*$/, '').replace(/_\d+$/, '');
        const containsVideoBase = img.name.includes(cleanVideoBase);

        let matched = false;
        if (exactMatch || containsDate || containsVideoBase) {
          matched = true;
        }

        if (matched) {
          img.assigned = true;
          const targetPath = path.join(streamTargetDir, img.name);
          if (!fs.existsSync(targetPath)) {
            fs.copyFileSync(img.fullPath, targetPath);
          }
          const imagePath = `/data/streams/${id}/${streamId}/${img.name}`;
          if (!streamData.images.includes(imagePath)) {
            streamData.images.push(imagePath);
          }
        }
      });
    });

    // 2. Time window fallback
    const nextStreamStart = validStreamIds[index + 1]
      ? finalStreamGroups[validStreamIds[index + 1]].startTime
      : new Date(stream.startTime.getTime() + 12 * 3600 * 1000);

    const timeWindowImages = allImages.filter(img =>
      !img.assigned &&
      (img.mtime >= stream.startTime.getTime() - 10 * 60 * 1000 && img.mtime < nextStreamStart.getTime())
    );

    timeWindowImages.sort((a, b) => b.mtime - a.mtime);

    const neededImages = Math.max(1, Math.min(maxImagesForThisStream, maxImagesPerStream - streamData.images.length));
    const imagesToAdd = timeWindowImages.slice(0, neededImages);
    imagesToAdd.forEach(img => {
      img.assigned = true;
      const targetPath = path.join(streamTargetDir, img.name);
      if (!fs.existsSync(targetPath)) {
        fs.copyFileSync(img.fullPath, targetPath);
      }
      const imagePath = `/data/streams/${id}/${streamId}/${img.name}`;
      if (!streamData.images.includes(imagePath)) {
        streamData.images.push(imagePath);
      }
    });

    // Initial highlights from any AI_HIGHLIGHT file in the group
    let groupHighlights = null;

    stream.files.forEach(({ file, sourceDir }) => {
      const ext = path.extname(file).toLowerCase();
      const targetPath = path.join(streamTargetDir, file);
      const fullSourcePath = path.join(sourceDir, file);

      if (!fs.existsSync(fullSourcePath)) {
        console.warn(`Source file not found: ${fullSourcePath}, skipping.`);
        return;
      }

      if (ext === '.srt') {
        if (!fs.existsSync(targetPath)) fs.copyFileSync(fullSourcePath, targetPath);
        streamData.srt = `/data/streams/${id}/${streamId}/${file}`;
      } else if (ext === '.xml') {
        if (!fs.existsSync(targetPath)) fs.copyFileSync(fullSourcePath, targetPath);
        streamData.xml = `/data/streams/${id}/${streamId}/${file}`;
      } else if (file.includes('cover')) {
        if (!fs.existsSync(targetPath)) fs.copyFileSync(fullSourcePath, targetPath);
        streamData.cover = `/data/streams/${id}/${streamId}/${file}`;
      } else if (ext === '.md' || ext === '.txt' || file.includes('AI_HIGHLIGHT')) {
        const isMarkdownOrTxt = ext === '.md' || ext === '.txt';
        if (isMarkdownOrTxt) {
          const content = fs.readFileSync(fullSourcePath, 'utf-8');
          const baseName = path.parse(file).name;
          const cleanBaseName = baseName.replace(/(_AI_HIGHLIGHT|_SUMMARY|_总结|_晚安)$/i, '');

          const hasMatchingVideo = stream.files.some(f => {
            if (f.file === file) return false;
            const fBase = path.parse(f.file).name;
            const isVideoOrXml = f.file.endsWith('.mp4') || f.file.endsWith('.flv') || f.file.endsWith('.xml');
            return isVideoOrXml && (fBase === baseName || fBase === cleanBaseName || baseName.startsWith(fBase));
          });

          if (hasMatchingVideo || file.includes('AI_HIGHLIGHT')) {
            if (streamData.highlights) {
              if (ext === '.md') {
                streamData.highlights = content + '\n\n---\n\n' + streamData.highlights;
              } else {
                streamData.highlights += '\n\n---\n\n' + content;
              }
            } else {
              streamData.highlights = content;
            }
          } else if (!groupHighlights) {
            groupHighlights = content;
          }
        }
      }
    });

    if (!streamData.highlights && groupHighlights) {
      streamData.highlights = groupHighlights;
    }

    if (streamData.highlights) {
      const highlightsPath = path.join(streamTargetDir, 'highlights.md');
      fs.writeFileSync(highlightsPath, streamData.highlights);
      streamData.highlights = `/data/streams/${id}/${streamId}/highlights.md`;
    }

    allStreams.push(streamData);
  });

  // Assign remaining images to closest streams
  const remainingImages = allImages.filter(img => !img.assigned);

  console.log(`\n=== Remaining images assignment ===`);
  console.log(`Total remaining images: ${remainingImages.length}`);

  remainingImages.forEach(img => {
    let closestStreamId = null;
    let minDiff = Infinity;

    validStreamIds.forEach(id => {
      const stream = finalStreamGroups[id];
      const diff = Math.abs(img.mtime - stream.startTime.getTime());
      if (diff < minDiff) {
        minDiff = diff;
        closestStreamId = id;
      }
    });

    if (closestStreamId) {
      const streamTargetDir = path.join(targetDir, closestStreamId);
      const targetPath = path.join(streamTargetDir, img.name);

      if (!fs.existsSync(targetPath)) {
        fs.copyFileSync(img.fullPath, targetPath);
      }

      const streamData = allStreams.find(s => s.id === closestStreamId);
      if (streamData) {
        const imagePath = `/data/streams/${id}/${closestStreamId}/${img.name}`;
        if (!streamData.images.includes(imagePath)) {
          streamData.images.push(imagePath);
        }
      }
      img.assigned = true;
    }
  });

  // 在增量模式下，合并现有数据和新数据
  let finalStreams = allStreams;
  if (mode === 'incremental' && existingStreams.length > 0) {
    console.log(`\n=== 合并现有数据和新数据 ===`);

    const existingStreamsMap = new Map();
    existingStreams.forEach(stream => {
      existingStreamsMap.set(stream.id, stream);
    });

    allStreams.forEach(newStream => {
      existingStreamsMap.set(newStream.id, newStream);
    });

    finalStreams = Array.from(existingStreamsMap.values());
    console.log(`合并后总计: ${finalStreams.length} 个直播数据 (原有: ${existingStreams.length}, 新增: ${allStreams.length})`);
  }

  finalStreams.sort((a, b) => b.id.localeCompare(a.id));

  fs.writeFileSync(
    path.join(targetDir, 'streams.json'),
    JSON.stringify(finalStreams, null, 2)
  );

  console.log(`同步完成: ${finalStreams.length} 个直播数据 (${allStreams.length} 个新处理)`);
  return { allStreams, existingStreams };
}

async function syncStreams() {
  const { mode, force, liverId, syncAll } = parseArgs();
  console.log(`=== 同步模式: ${mode === 'incremental' ? '增量处理' : '全量处理'} ===`);
  if (force) {
    console.log('=== 强制模式: 将重新处理所有数据 ===');
  }

  // 确定要处理的主播列表
  let liverIdsToProcess = [];
  if (syncAll) {
    liverIdsToProcess = getAllLiverIds();
  } else if (liverId) {
    liverIdsToProcess = [liverId];
  } else {
    // 默认处理岁己SUI（向后兼容）
    liverIdsToProcess = ['sui'];
  }
  console.log(`要处理的主播列表: ${liverIdsToProcess.join(', ')}`);
  // 为每个主播处理数据
  const allFinalStreams = [];
  for (const currentLiverId of liverIdsToProcess) {
    const liverConfig = getLiverConfig(currentLiverId);
    if (!liverConfig) {
      console.warn(`未找到主播配置: ${currentLiverId}，跳过`);
      continue;
    }

    const { allStreams, existingStreams } = await processLiver(liverConfig, mode, force, allFinalStreams);
    allFinalStreams.push(...allStreams);
  }

  console.log(`\n=== 总计 ===`);
  console.log(`所有主播同步完成，总计 ${allFinalStreams.length} 个直播数据`);

  return allFinalStreams;
}

syncStreams().catch(console.error);

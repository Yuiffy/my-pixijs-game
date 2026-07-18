import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { liverConfigs, getLiverConfig, getAllLiverIds } from './liver-config.js';
import {
  calculateOverlapRatio,
  choosePreferredArtifact,
  choosePreferredSrt,
  copyFileIfChanged,
  getIncrementalRefreshStart,
  imageBelongsToStream,
  isImageFallbackCandidate,
  mergeRefreshedStream,
  parseStreamArtifact,
  readXmlDuration,
  shouldScanDateFolder,
} from './stream-sync-helpers.mjs';
import {
  getAssignedShard,
  getIndexStreamsRoot,
  getRepoPath,
  getReposRoot,
  loadShardConfig,
  resolveStreamTargetDir,
} from './stream-shards.mjs';

/**
 * 直播同步脚本
 *
 * 功能：从源目录同步直播文件到目标目录，生成streams.json供前端使用
 *
 * 支持两种模式：
 * 1. 增量处理（默认）：回看最近直播及尚未补齐的后处理产物，同时收集更新数据
 * 2. 全量处理（--full）：处理所有历史数据，适用于首次运行或需要重新处理的情况
 *
 * 可选参数：
 * --full: 启用全量处理模式
 * --force: 强制重新处理所有数据（在全量模式下有效）
 * --liver [id]: 指定要同步的主播ID
 * --all: 同步所有主播
 *
 * 使用示例：
 * node sync_streams.mjs                    # 增量处理（默认，所有主播）
 * node sync_streams.mjs --full             # 全量处理（所有主播）
 * node sync_streams.mjs --liver sui        # 同步指定主播（增量）
 * node sync_streams.mjs --liver sui --full  # 同步指定主播（全量）
 * node sync_streams.mjs --all                # 同步所有主播（增量）
 * node sync_streams.mjs --all --full        # 同步所有主播（全量）
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, '..');
const SHARD_CONFIG = loadShardConfig();
const REPOS_ROOT = getReposRoot();
const INDEX_REPO_DIR = getRepoPath(SHARD_CONFIG.index.repo, REPOS_ROOT);
const TARGET_BASE_DIR = getIndexStreamsRoot(SHARD_CONFIG, REPOS_ROOT);

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  // 默认改为增量处理，除非显式指定 --full
  const mode = args.includes('--full') ? 'full' : 'incremental';
  const force = args.includes('--force');

  // 解析主播ID
  let liverId = null;
  const liverIndex = args.indexOf('--liver');
  if (liverIndex !== -1 && args[liverIndex + 1]) {
    liverId = args[liverIndex + 1];
  }

  // 是否同步所有主播
  const syncAll = args.includes('--all');

  return { mode, force, liverId, syncAll };
}

if (!fs.existsSync(path.join(INDEX_REPO_DIR, '.git'))) {
  throw new Error(
    `Index repository is missing or is not a Git checkout: ${INDEX_REPO_DIR}. `
    + 'Set STREAM_REPOS_ROOT to the parent directory containing all stream repositories.',
  );
}

if (!fs.existsSync(TARGET_BASE_DIR)) {
  fs.mkdirSync(TARGET_BASE_DIR, { recursive: true });
}

function preflightLiverAssignments(liverId, sourceDirs) {
  const years = new Set();
  for (const sourceDir of sourceDirs) {
    if (!fs.existsSync(sourceDir)) continue;
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
      const match = entry.isDirectory() ? /^(\d{4})_/.exec(entry.name) : null;
      if (match) years.add(Number(match[1]));
    }
  }
  for (const year of years) getAssignedShard(liverId, year, SHARD_CONFIG);
}

// 获取指定主播的最新已同步直播的时间戳
function getLatestSyncedTimestampForLiver(targetDir) {
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

async function syncStreams() {
  const { mode, force, liverId, syncAll } = parseArgs();

  // 确定要处理的主播列表
  let liverIdsToProcess = [];
  if (syncAll) {
    liverIdsToProcess = getAllLiverIds();
    console.log(`=== 同步所有主播: ${liverIdsToProcess.join(', ')} ===`);
  } else if (liverId) {
    liverIdsToProcess = [liverId];
    console.log(`=== 同步指定主播: ${liverId} ===`);
  } else {
    // 默认处理所有主播
    liverIdsToProcess = getAllLiverIds();
    console.log(`=== 同步所有主播: ${liverIdsToProcess.join(', ')} ===`);
  }

  console.log(`同步模式: ${mode === 'incremental' ? '增量处理' : '全量处理'} ===`);
  if (force) {
    console.log('=== 强制模式: 将重新处理所有数据 ===');
  }

  // 为每个主播处理数据
  const allFinalStreams = [];

  for (const currentLiverId of liverIdsToProcess) {
    const liverConfig = getLiverConfig(currentLiverId);
    if (!liverConfig) {
      throw new Error(`Unknown liver configuration: ${currentLiverId}`);
    }

    console.log(`\n=== 开始处理主播: ${liverConfig.name} (${currentLiverId}) ===`);

    const targetBaseDir = path.join(TARGET_BASE_DIR, currentLiverId);
    if (!fs.existsSync(targetBaseDir)) {
      fs.mkdirSync(targetBaseDir, { recursive: true });
    }

    const configuredSourceDirs = liverConfig.sourceDirs || [];
    if (configuredSourceDirs.length === 0) {
      throw new Error(`Liver ${currentLiverId} has no configured source directories`);
    }
    const sourceDirs = configuredSourceDirs.filter((sourceDir) => {
      if (fs.existsSync(sourceDir)) return true;
      console.warn(`Source directory not found: ${sourceDir}`);
      return false;
    });
    if (sourceDirs.length === 0) {
      throw new Error(
        `None of the configured source directories are available for liver ${currentLiverId}`,
      );
    }
    preflightLiverAssignments(currentLiverId, sourceDirs);

    // 加载现有的streams数据（用于增量模式合并）
    let existingStreams = [];
    const streamsJsonPath = path.join(targetBaseDir, 'streams.json');
    if (fs.existsSync(streamsJsonPath)) {
      try {
        const content = fs.readFileSync(streamsJsonPath, 'utf-8');
        existingStreams = JSON.parse(content);
        console.log(`已加载 ${existingStreams.length} 个现有直播数据`);
      } catch (error) {
        console.warn(`无法读取现有streams.json: ${error.message}`);
      }
    }

    const latestSyncedTime = mode === 'incremental' ? getLatestSyncedTimestampForLiver(targetBaseDir) : null;
    const refreshStart = mode === 'incremental' && latestSyncedTime
      ? getIncrementalRefreshStart(existingStreams)
      : null;
    if (mode === 'incremental' && latestSyncedTime) {
      console.log(
        `增量处理: 收集 ${latestSyncedTime.toISOString()} 之后的新直播，`
        + `并回看 ${refreshStart.toISOString()} 之后的已有直播`,
      );
    } else if (mode === 'incremental' && !latestSyncedTime) {
      console.log('增量处理: 未找到已同步数据，将执行全量处理');
    }

  const allStreams = [];
  const allStreamGroups = {};
  const allPotentialTitles = [];
  const allImages = [];

  for (const sourceDir of sourceDirs) {
    const dateFolders = fs.readdirSync(sourceDir).filter(f => {
      const fullPath = path.join(sourceDir, f);
      return fs.statSync(fullPath).isDirectory()
        && /^\d{4}_\d{2}_\d{2}$/.test(f)
        && shouldScanDateFolder(f, { mode, refreshStart, latestSyncedTime });
    });

    for (const dateFolder of dateFolders) {
      const fullSourcePath = path.join(sourceDir, dateFolder);
      const files = fs.readdirSync(fullSourcePath);

      // 1. First Pass: Collect all files and potential titles
      files.forEach(file => {
        const fullPath = path.join(fullSourcePath, file);
        const stats = fs.statSync(fullPath);

        const artifact = parseStreamArtifact(file);
        const timestamp = artifact?.startTime || null;
        const title = ['video', 'xml', 'cover'].includes(artifact?.kind) ? artifact.title : null;

        if (timestamp && title && !title.includes('摸鱼茶水间') && !title.includes('无题')) { // Skip default placeholders if possible
          allPotentialTitles.push({ timestamp, title, mtime: stats.mtimeMs });
        }
      });

      // Done collecting titles for this folder

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
                const artifact = parseStreamArtifact(file);
                const imageDateMatch = fullSourcePath.match(/(\d{4}_\d{2}_\d{2})/);
                const imageDate = imageDateMatch ? imageDateMatch[1].replace(/_/g, '-') : null;
                // Check if this image is already in the allImages array (from previous source dir)
                const existingIndex = allImages.findIndex(img => img.name === file && img.sourceDir === dir);
                if (existingIndex >= 0) {
                  // Update existing entry
                  allImages[existingIndex].mtime = stats.mtimeMs;
                  allImages[existingIndex].streamId = artifact?.streamId || null;
                  allImages[existingIndex].date = imageDate;
                  allImages[existingIndex].topLevel = dir === fullSourcePath;
                  allImages[existingIndex].assigned = false; // Reset assignment status
                } else {
                  allImages.push({
                    name: file,
                    fullPath: fullPath,
                    mtime: stats.mtimeMs,
                    sourceDir: dir,
                    streamId: artifact?.streamId || null,
                    date: imageDate,
                    topLevel: dir === fullSourcePath,
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

        const artifact = parseStreamArtifact(file);
        const dateTimeStr = artifact?.streamId || null;
        const titlePart = artifact?.title || null;
        const startTime = artifact?.startTime || null;

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

          const fileEntry = {
            file,
            sourceDir: fullSourcePath,
            artifact,
            duration: artifact.kind === 'xml' ? readXmlDuration(fullPath) : 0,
          };
          allStreamGroups[dateTimeStr].files.push(fileEntry);
          if (fileEntry.duration > allStreamGroups[dateTimeStr].duration) {
            allStreamGroups[dateTimeStr].duration = fileEntry.duration;
          }
        }
      });
    }
  }

  // Merge close groups (deduplication across all collected groups)
  const sortedKeys = Object.keys(allStreamGroups).sort((a, b) => allStreamGroups[a].startTime - allStreamGroups[b].startTime);
  const mergedStreamGroups = {};
  const mergedKeys = new Set(); // Track which keys have been merged

  // Debug logging for duplicate detection
  console.log(`\n=== 去重检测 ===`);
  console.log(`检测到 ${sortedKeys.length} 个原始直播组`);

  sortedKeys.forEach(key => {
    const current = allStreamGroups[key];
    let merged = false;
    
    // Check if this key has already been merged into another group
    if (mergedKeys.has(key)) {
      console.log(`跳过已合并的键: ${key}`);
      return;
    }
    
    for (const mKey in mergedStreamGroups) {
      const existing = mergedStreamGroups[mKey];
      
      // Calculate overlap ratio
      const overlapRatio = calculateOverlapRatio(current, existing);
      
      // If overlap >= 90%, merge
      if (overlapRatio >= 0.9) {
        console.log(`合并直播组: ${key} (${current.startTime.toISOString()}) -> ${mKey} (${existing.startTime.toISOString()}), 重叠度: ${(overlapRatio * 100).toFixed(1)}%`);
        
        // Merge files
        existing.files.push(...current.files);
        
        // Keep the longer duration
        if (current.duration > existing.duration) existing.duration = current.duration;
        
        // Keep the earliest startTime/ID as the anchor
        if (current.startTime.getTime() < existing.startTime.getTime()) {
          existing.startTime = current.startTime;
          existing.id = current.id;
          existing.date = current.date;
          existing.time = current.time;
        }
        
        // Mark this key as merged
        mergedKeys.add(key);
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
  // This ensures that images can be reassigned if they were previously assigned to wrong streams
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

  // First, group streams by date for balanced image distribution
  const streamsByDate = {};
  validStreamIds.forEach(streamId => {
    const stream = finalStreamGroups[streamId];
    if (!streamsByDate[stream.date]) {
      streamsByDate[stream.date] = [];
    }
    streamsByDate[stream.date].push(streamId);
  });

  // Count available images for each date to enable better balanced distribution
  const availableImagesByDate = {};
  allImages.forEach(img => {
    const datePartMatch = img.name.match(/(\d{4}_\d{2}_\d{2})/);
    let dateStr = null;
    if (datePartMatch) {
      dateStr = datePartMatch[1].replace(/_/g, '-');
    } else {
      // Fallback to sourceDir
      const dirMatch = img.sourceDir.match(/(\d{4}_\d{2}_\d{2})/);
      if (dirMatch) {
        dateStr = dirMatch[1].replace(/_/g, '-');
      }
    }

    if (dateStr) {
      availableImagesByDate[dateStr] = (availableImagesByDate[dateStr] || 0) + 1;
    }
  });

  // Process each final stream group
  validStreamIds.forEach((streamId, index) => {
    const stream = finalStreamGroups[streamId];
    const targetDir = resolveStreamTargetDir(
      currentLiverId,
      streamId,
      SHARD_CONFIG,
      REPOS_ROOT,
    );
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

    // Debug logging for 2026_01_09 streams
    if (streamId.includes('2026_01_09')) {
      console.log(`\n=== Processing stream ${streamId} (${stream.title}) ===`);
      console.log(`Start time: ${stream.startTime}, Hour: ${stream.time.split(':')[0]}`);
      console.log(`Total images in allImages: ${allImages.length}`);
      console.log(`Unassigned images: ${allImages.filter(img => !img.assigned).length}`);
    }

    const hours = stream.duration / 3600;
    streamData.durationStr = hours >= 0.1 ? `${hours.toFixed(1)} 小时` : `${Math.floor(stream.duration / 60)} 分钟`;

    const [h, m] = stream.time.split(':').map(Number);
    const startDate = new Date(2000, 0, 1, h, m, 0); // Dummy date for time calculation
    const endDate = new Date(startDate.getTime() + stream.duration * 1000);

    streamData.startTime = stream.time.split(':').slice(0, 2).join(':');
    streamData.endTime = endDate.toTimeString().split(' ')[0].split(':').slice(0, 2).join(':');

    // Calculate balanced image distribution for streams on the same date
    const streamsOnSameDate = streamsByDate[stream.date] || [];
    const totalStreamsOnDate = streamsOnSameDate.length;

    // Calculate fair distribution for this stream
    const maxImagesPerStream = 5;
    let maxImagesForThisStream = maxImagesPerStream;

    if (totalStreamsOnDate > 1) {
      // For multiple streams on the same date, ensure fair distribution
      // First, ensure each stream gets at least one image
      const minImagesPerStream = 1;

      // Get actual available images for this date
      const actualAvailableImages = availableImagesByDate[stream.date] || 0;

      // Calculate fair distribution: total images / total streams
      // If we have 2 images and 2 streams, fair limit is 1.
      const fairImagesPerStream = Math.max(minImagesPerStream, Math.ceil(actualAvailableImages / totalStreamsOnDate));

      // Limit this stream to fair distribution
      maxImagesForThisStream = Math.min(maxImagesPerStream, fairImagesPerStream);

      if (streamId.includes('2026_01_12') || streamId.includes('2026_01_09')) {
        console.log(`Dynamic balanced distribution for ${streamId}:`);
        console.log(`  Actual images on ${stream.date}: ${actualAvailableImages}`);
        console.log(`  Fair limit: ${maxImagesForThisStream}`);
      }
    }

    // Debug logging for balanced distribution in filename matching
    if (streamId.includes('2026_01_09') || streamId.includes('2026_01_12') || streamId.includes('2026_01_05')) {
      console.log(`\nFilename matching balanced distribution for ${streamId}:`);
      console.log(`  Total streams on ${stream.date}: ${totalStreamsOnDate}`);
      console.log(`  Max images for this stream: ${maxImagesForThisStream}`);
    }

    // Assign images to this stream
    // 0. Recorder-derived images belong to the stream encoded in their filename.
    allImages
      .filter((img) => img.topLevel && !img.assigned && imageBelongsToStream(img, streamId))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, maxImagesForThisStream)
      .forEach((img) => {
        img.assigned = true;
        copyFileIfChanged(img.fullPath, path.join(targetDir, img.name));
        streamData.images.push(`/data/streams/${currentLiverId}/${streamId}/${img.name}`);
      });

    // 1. Filename matching - more flexible matching
    stream.files.forEach(({ file }) => {
      const videoBase = path.parse(file).name;
      const datePart = streamId.substring(0, 10); // YYYY_MM_DD

      allImages.forEach(img => {
        if (img.streamId && (!img.topLevel || img.streamId !== streamId)) return;
        // Skip if this stream already has enough images
        if (streamData.images.length >= maxImagesForThisStream) {
          return;
        }

        const hasKeyword = img.name.includes('午台') || img.name.includes('晚台');
        const isMorningStream = h < 18;
        const hasMorningKeyword = img.name.includes('午台');
        const hasEveningKeyword = img.name.includes('晚台');
        const keywordMatchesThisStream = (isMorningStream && hasMorningKeyword) || (!isMorningStream && hasEveningKeyword);
        const imageDateMatch = img.sourceDir.includes(datePart) || img.sourceDir.includes(datePart.replace(/_/g, ''));

        let shouldReassign = false;
        if (img.assigned && hasKeyword) {
          shouldReassign = keywordMatchesThisStream && imageDateMatch;
        }

        if (!img.assigned || shouldReassign) {
          const exactMatch = img.name.startsWith(streamId) || img.name.startsWith(videoBase);
          const containsDate = img.name.includes(datePart);
          const cleanVideoBase = videoBase.replace(/_DDTV5.*$/, '').replace(/_\d+$/, '');
          const containsVideoBase = img.name.includes(cleanVideoBase);

          let matched = false;
          if (hasKeyword) {
            if (keywordMatchesThisStream && imageDateMatch) {
              matched = true;
            }
          } else if (exactMatch || containsDate || containsVideoBase) {
            matched = true;
          }

          if (matched) {
            img.assigned = true;
            const targetPath = path.join(targetDir, img.name);
            copyFileIfChanged(img.fullPath, targetPath);
            const imagePath = `/data/streams/${currentLiverId}/${streamId}/${img.name}`;
            if (!streamData.images.includes(imagePath)) {
              streamData.images.push(imagePath);
              if (streamId.includes('2026_01_09') || streamId.includes('2026_01_12')) {
                console.log(`Filename match assigned: ${img.name} to ${streamId}`);
              }
            }
          }
        }
      });
    });

    // 2. Time window fallback
    const nextStreamStart = validStreamIds[index + 1]
      ? finalStreamGroups[validStreamIds[index + 1]].startTime
      : new Date(stream.startTime.getTime() + 12 * 3600 * 1000); // Default to 12 hours after if last stream

    // First, assign keyword images with priority
    // For morning/afternoon streams (before 18:00), prioritize 午台 images
    // For evening streams (after 18:00), prioritize 晚台 images
    const keywordImages = allImages.filter(img =>
      !img.assigned &&
      (img.name.includes('午台') || img.name.includes('晚台'))
    );

    // Debug logging for keyword images
    if (streamId.includes('2026_01_09')) {
      console.log(`\nChecking keyword images for ${streamId}:`);
      console.log(`Total images: ${allImages.length}`);
      console.log(`Unassigned images: ${allImages.filter(img => !img.assigned).length}`);
      console.log(`Keyword images found: ${keywordImages.length}`);

      // List all unassigned images with keyword info
      const unassignedImages = allImages.filter(img => !img.assigned);
      console.log(`Unassigned images list:`);
      unassignedImages.forEach(img => {
        console.log(`  - ${img.name} (午台: ${img.name.includes('午台')}, 晚台: ${img.name.includes('晚台')})`);
      });

      if (keywordImages.length > 0) {
        console.log(`Keyword images for ${streamId}:`);
        keywordImages.forEach(img => {
          console.log(`  - ${img.name} (午台: ${img.name.includes('午台')}, 晚台: ${img.name.includes('晚台')})`);
        });
      }
    }

    // Sort keyword images by relevance: exact match first, then by modification time
    keywordImages.sort((a, b) => {
      const aIsExactMatch = (a.name.includes('午台') && h < 18) || (a.name.includes('晚台') && h >= 18);
      const bIsExactMatch = (b.name.includes('午台') && h < 18) || (b.name.includes('晚台') && h >= 18);

      // Exact matches first
      if (aIsExactMatch && !bIsExactMatch) return -1;
      if (!aIsExactMatch && bIsExactMatch) return 1;

      // For same match type, sort by modification time (newer first)
      return b.mtime - a.mtime;
    });

    // Assign keyword images with priority - ensure at least one keyword image per stream if available
    keywordImages.forEach(img => {
      // Check if this image is already in the target directory (may have been copied earlier)
      const targetPath = path.join(targetDir, img.name);

      // Assign if it's an exact match for this time slot
      const isExactMatch = (img.name.includes('午台') && h < 18) || (img.name.includes('晚台') && h >= 18);

      // Also check if the image is from the same date as the stream
      const datePart = streamId.substring(0, 10); // YYYY_MM_DD
      // Check if sourceDir contains the date in either format (with or without underscores)
      const imageDateMatch = img.sourceDir.includes(datePart) || img.sourceDir.includes(datePart.replace(/_/g, ''));

      const imagePath = `/data/streams/${currentLiverId}/${streamId}/${img.name}`;
      const alreadyInArray = streamData.images.includes(imagePath);

      if (isExactMatch && imageDateMatch && !alreadyInArray && !img.streamId) {
        // This is a strong match - assign it
        img.assigned = true;
        copyFileIfChanged(img.fullPath, targetPath);
        streamData.images.push(imagePath);
        if (streamId.includes('2026_01_09')) {
          console.log(`Assigned keyword image ${img.name} to ${streamId} (exact match + same date)`);
        }
      }
      // Also assign if no exact match found and we need at least one image
      else if (streamData.images.length === 0 && !alreadyInArray && !img.streamId && imageDateMatch) {
        // If this stream has no images yet, assign a same-day keyword image as fallback
        img.assigned = true;
        copyFileIfChanged(img.fullPath, targetPath);
        streamData.images.push(imagePath);
        if (streamId.includes('2026_01_09')) {
          console.log(`Assigned keyword image ${img.name} to ${streamId} (fallback)`);
        }
      } else if (alreadyInArray && streamId.includes('2026_01_09')) {
        console.log(`Keyword image ${img.name} already in array for ${streamId}, skipping duplicate`);
      }
    });

    // Then, time window for remaining images
    const timeWindowImages = allImages.filter(img =>
      !img.assigned
      && !img.streamId
      && isImageFallbackCandidate(img, stream)
      && img.mtime >= stream.startTime.getTime() - 10 * 60 * 1000
      && img.mtime < nextStreamStart.getTime()
    );

    timeWindowImages.sort((a, b) => b.mtime - a.mtime);

    // For balanced distribution, we need to estimate how many images are available for this date
    // Count images that are already assigned to streams on this date
    let totalAssignedImagesOnDate = streamData.images.length;

    // Add images from other streams on the same date (already processed)
    for (const otherStreamId of streamsOnSameDate) {
      if (otherStreamId === streamId) continue;

      // Check if this stream has already been processed
      const otherStreamData = allStreams.find(s => s.id === otherStreamId);
      if (otherStreamData) {
        totalAssignedImagesOnDate += otherStreamData.images.length;
      }

      // Estimate time window images for other streams
      // This is complex, so we'll use a simpler approach:
      // Just ensure each stream gets at least one image if possible
    }

    // Recalculate fair distribution based on actual time window images
    if (totalStreamsOnDate > 1) {
      // For multiple streams on the same date, ensure fair distribution
      // First, ensure each stream gets at least one image
      const minImagesPerStream = 1;

      // Calculate how many images this stream should get based on fair distribution
      // We want to distribute available images evenly among all streams on this date
      const estimatedAvailableImages = timeWindowImages.length + totalAssignedImagesOnDate;
      const fairImagesPerStream = Math.max(minImagesPerStream, Math.floor(estimatedAvailableImages / totalStreamsOnDate));

      // Limit this stream to fair distribution
      maxImagesForThisStream = Math.min(maxImagesPerStream, fairImagesPerStream);

      // Debug logging
      if (streamId.includes('2026_01_09') || streamId.includes('2026_01_12') || streamId.includes('2026_01_05')) {
        console.log(`\nBalanced distribution for ${streamId}:`);
        console.log(`  Total streams on ${stream.date}: ${totalStreamsOnDate}`);
        console.log(`  Already assigned images on date: ${totalAssignedImagesOnDate}`);
        console.log(`  Time window images available: ${timeWindowImages.length}`);
        console.log(`  Estimated available images: ${estimatedAvailableImages}`);
        console.log(`  Fair images per stream: ${fairImagesPerStream}`);
        console.log(`  Max images for this stream: ${maxImagesForThisStream}`);
      }
    }

    // Take images from time window, respecting the limit
    const neededImages = Math.max(1, Math.min(maxImagesForThisStream, maxImagesPerStream - streamData.images.length));
    const imagesToAdd = timeWindowImages.slice(0, neededImages);
    imagesToAdd.forEach(img => {
      img.assigned = true;
      const targetPath = path.join(targetDir, img.name);
      copyFileIfChanged(img.fullPath, targetPath);
      const imagePath = `/data/streams/${currentLiverId}/${streamId}/${img.name}`;
      // Check if image is already in the array before adding
      if (!streamData.images.includes(imagePath)) {
        streamData.images.push(imagePath);
        if (streamId.includes('2026_01_09') || streamId.includes('2026_01_12') || streamId.includes('2026_01_05')) {
          console.log(`Assigned time window image ${img.name} to ${streamId}`);
        }
      } else if (streamId.includes('2026_01_09') || streamId.includes('2026_01_12') || streamId.includes('2026_01_05')) {
        console.log(`Time window image ${img.name} already in array for ${streamId}, skipping duplicate`);
      }
    });

    // Initial highlights from any AI_HIGHLIGHT file in the group
    let groupHighlights = null;

    const preferredSrt = choosePreferredSrt(stream.files);
    const preferredXml = choosePreferredArtifact(stream.files, 'xml');
    const preferredCover = choosePreferredArtifact(stream.files, 'cover');
    const preferredFiles = new Set(
      [preferredSrt, preferredXml, preferredCover].filter(Boolean).map((entry) => entry.file),
    );

    stream.files
      .slice()
      .sort((a, b) => a.file.localeCompare(b.file))
      .forEach(({ file, sourceDir, artifact }) => {
      const ext = path.extname(file).toLowerCase();
      const targetPath = path.join(targetDir, file);
      const fullSourcePath = path.join(sourceDir, file);

      if (!fs.existsSync(fullSourcePath)) {
        console.warn(`Source file not found: ${fullSourcePath}, skipping.`);
        return;
      }

      if (artifact?.kind === 'srt' || artifact?.kind === 'speaker-srt') {
        if (preferredFiles.has(file) && preferredSrt?.file === file) {
          copyFileIfChanged(fullSourcePath, targetPath);
          streamData.srt = `/data/streams/${currentLiverId}/${streamId}/${file}`;
        }
      } else if (artifact?.kind === 'xml') {
        if (preferredFiles.has(file) && preferredXml?.file === file) {
          copyFileIfChanged(fullSourcePath, targetPath);
          streamData.xml = `/data/streams/${currentLiverId}/${streamId}/${file}`;
        }
      } else if (artifact?.kind === 'cover') {
        if (preferredFiles.has(file) && preferredCover?.file === file) {
          copyFileIfChanged(fullSourcePath, targetPath);
          streamData.cover = `/data/streams/${currentLiverId}/${streamId}/${file}`;
        }
      } else if (ext === '.md' || ext === '.txt' || file.includes('AI_HIGHLIGHT')) {
        // Collect highlights/summaries
        const isMarkdownOrTxt = ext === '.md' || ext === '.txt';
        if (isMarkdownOrTxt) {
           const content = fs.readFileSync(fullSourcePath, 'utf-8');
           const baseName = path.parse(file).name;

           // Clean up common suffixes for matching
           const cleanBaseName = baseName.replace(/(_AI_HIGHLIGHT|_SUMMARY|_总结|_晚安)$/i, '');

           const hasMatchingVideo = stream.files.some(f => {
             if (f.file === file) return false;
             const fBase = path.parse(f.file).name;
             const isVideoOrXml = f.file.endsWith('.mp4') || f.file.endsWith('.flv') || f.file.endsWith('.xml');
             return isVideoOrXml && (fBase === baseName || fBase === cleanBaseName || baseName.startsWith(fBase));
           });

           if (hasMatchingVideo || file.includes('AI_HIGHLIGHT')) {
             if (streamData.highlights) {
                // If current file is .md and existing is likely from .txt (AI_HIGHLIGHT), prepend.
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
      const highlightsPath = path.join(targetDir, 'highlights.md');
      copyFileIfChanged(Buffer.from(streamData.highlights), highlightsPath);
      streamData.highlights = `/data/streams/${currentLiverId}/${streamId}/highlights.md`;
    }

    allStreams.push(streamData);
  });

  // Assign remaining images to closest streams
  const remainingImages = allImages.filter(img => !img.assigned && !img.streamId);

  // Debug logging for remaining images
  console.log(`\n=== Remaining images assignment ===`);
  console.log(`Total remaining images: ${remainingImages.length}`);
  remainingImages.forEach(img => {
    console.log(`  - ${img.name} (mtime: ${new Date(img.mtime).toISOString()})`);
  });

  remainingImages.forEach(img => {
    let closestStreamId = null;
    let minDiff = Infinity;

    // Check if image has keywords that should match specific time slots
    const hasMorningKeyword = img.name.includes('午台');
    const hasEveningKeyword = img.name.includes('晚台');

    validStreamIds.forEach(id => {
      const stream = finalStreamGroups[id];
      if (!isImageFallbackCandidate(img, stream)) return;
      const streamHour = parseInt(stream.time.split(':')[0]);

      // Calculate time difference
      const diff = Math.abs(img.mtime - stream.startTime.getTime());

      // If image has keywords, prioritize matching time slots
      if (hasMorningKeyword || hasEveningKeyword) {
        const isMorningStream = streamHour < 18;
        const keywordMatchesTime = (hasMorningKeyword && isMorningStream) || (hasEveningKeyword && !isMorningStream);

        if (keywordMatchesTime) {
          // This is a good match - use it
          if (diff < minDiff) {
            minDiff = diff;
            closestStreamId = id;
          }
        }
      } else {
        // No keywords, just use closest time
        if (diff < minDiff) {
          minDiff = diff;
          closestStreamId = id;
        }
      }
    });

    if (closestStreamId) {
      const targetDir = resolveStreamTargetDir(
        currentLiverId,
        closestStreamId,
        SHARD_CONFIG,
        REPOS_ROOT,
      );
      const targetPath = path.join(targetDir, img.name);

      // Check if image already exists in target directory (may have been copied earlier)
      copyFileIfChanged(img.fullPath, targetPath);

      const streamData = allStreams.find(s => s.id === closestStreamId);
      if (streamData) {
        // Check if image is already in the images array (avoid duplicates)
        const imagePath = `/data/streams/${currentLiverId}/${closestStreamId}/${img.name}`;
        if (!streamData.images.includes(imagePath)) {
          streamData.images.push(imagePath);
        }
      }
      img.assigned = true; // Mark as assigned to prevent further processing

      // Debug logging
      console.log(`Assigned ${img.name} to ${closestStreamId} (time diff: ${minDiff}ms)`);
    }
  });

  // 在增量模式下，合并现有数据和新数据
  let finalStreams = allStreams;
  if (mode === 'incremental' && existingStreams.length > 0) {
    console.log(`\n=== 合并现有数据和新数据 ===`);

    // 创建现有streams的映射，便于查找和更新
    const existingStreamsMap = new Map();
    existingStreams.forEach(stream => {
      existingStreamsMap.set(stream.id, stream);
    });

    // 更新或添加新streams；本轮图片列表为权威结果，标量资源缺失时保留旧值。
    allStreams.forEach(newStream => {
      const existing = existingStreamsMap.get(newStream.id);
      existingStreamsMap.set(newStream.id, mergeRefreshedStream(existing, newStream));
    });

    // 转换回数组并排序
    finalStreams = Array.from(existingStreamsMap.values());
    console.log(`合并后总计: ${finalStreams.length} 个直播数据 (原有: ${existingStreams.length}, 新增: ${allStreams.length})`);
  }

  const refreshedIds = new Set(allStreams.map((stream) => stream.id));

  // 对最终结果进行去重（处理现有数据中可能存在的重复）
  console.log(`\n=== 最终去重 ===`);
  const deduplicatedStreams = [];
  const processedIds = new Set();

  // Sort streams by id (time) for consistent deduplication
  finalStreams.sort((a, b) => a.id.localeCompare(b.id));

  finalStreams.forEach(stream => {
    if (processedIds.has(stream.id)) {
      return;
    }

    let merged = false;
    for (const existing of deduplicatedStreams) {
      const overlapRatio = calculateOverlapRatio(stream, existing);
      
      if (overlapRatio >= 0.9) {
        console.log(`最终去重: ${stream.id} -> ${existing.id}, 重叠度: ${(overlapRatio * 100).toFixed(1)}%`);
        
        // A stream reconstructed in this run owns its freshly calculated image list.
        const streamWasRefreshed = refreshedIds.has(stream.id);
        const existingWasRefreshed = refreshedIds.has(existing.id);
        if (streamWasRefreshed && !existingWasRefreshed) {
          existing.images = [...stream.images];
        } else if (!existingWasRefreshed) {
          stream.images.forEach(img => {
            if (!existing.images.includes(img)) existing.images.push(img);
          });
        }
        
        // Keep longer duration
        if (stream.duration > existing.duration) {
          existing.duration = stream.duration;
          existing.durationStr = stream.durationStr;
        }
        
        // Keep better data (prefer non-null values)
        if (!existing.srt && stream.srt) existing.srt = stream.srt;
        if (!existing.xml && stream.xml) existing.xml = stream.xml;
        if (!existing.cover && stream.cover) existing.cover = stream.cover;
        if (!existing.highlights && stream.highlights) existing.highlights = stream.highlights;
        
        merged = true;
        break;
      }
    }
    
    if (!merged) {
      deduplicatedStreams.push(stream);
      processedIds.add(stream.id);
    }
  });

  finalStreams = deduplicatedStreams;
  console.log(`最终去重后: ${finalStreams.length} 个直播数据`);

  finalStreams.sort((a, b) => b.id.localeCompare(a.id));

  fs.writeFileSync(
    path.join(targetBaseDir, 'streams.json'),
    JSON.stringify(finalStreams, null, 2)
  );

  console.log(`同步完成: ${finalStreams.length} 个直播数据 (${allStreams.length} 个新处理)`);
}

}
syncStreams().catch((error) => {
  console.error(`[${new Date().toISOString()}] Stream collection failed:`, error);
  process.exitCode = 1;
});

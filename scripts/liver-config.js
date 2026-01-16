/**
 * 主播数据源配置
 * 用于自动化脚本同步多主播数据
 *
 * NOTE: 这里的配置已迁移到 src/data/livers/liverConfigs.json
 * 此文件现在作为中间层，读取该 JSON 并提供给脚本使用。
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 读取 JSON 配置
// path.join(__dirname, '..') 指向项目根目录
const configPath = path.join(__dirname, '../src/data/livers/liverConfigs.json');

let liverConfigs = {};
try {
  if (fs.existsSync(configPath)) {
    const fileContent = fs.readFileSync(configPath, 'utf-8');
    liverConfigs = JSON.parse(fileContent);
  } else {
    console.warn(`WARNING: Config file not found at ${configPath}`);
  }
} catch (error) {
  console.error(`ERROR: Failed to load liver configs: ${error.message}`);
}

function getLiverConfig(liverId) {
  return liverConfigs[liverId];
}

function getAllLiverIds() {
  return Object.keys(liverConfigs);
}

export {
  liverConfigs,
  getLiverConfig,
  getAllLiverIds
};

// CommonJS 导出
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    liverConfigs,
    getLiverConfig,
    getAllLiverIds
  };
}

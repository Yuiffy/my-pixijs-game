import { loadShardConfig, rawGitHubBase } from './scripts/stream-shards.mjs';

const shardConfig = loadShardConfig();

function streamRewrites() {
  const indexBase = rawGitHubBase(shardConfig.index.repo, shardConfig.index.branch);
  const routes = [
    {
      source: '/data/streams/:liver/streams.json',
      destination: `${indexBase}/public/data/streams/:liver/streams.json`,
    },
  ];

  for (const [key, shardId] of Object.entries(shardConfig.assignments)) {
    const [year, liverId] = key.split(':');
    const shard = shardConfig.shards[shardId];
    const assetBase = rawGitHubBase(shard.repo, shard.branch);
    routes.push({
      source: `/data/streams/${liverId}/:streamId(${year}_[^/]+)/:path*`,
      destination: `${assetBase}/public/data/streams/${liverId}/:streamId/:path*`,
    });
  }

  return routes;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: streamRewrites(),
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;

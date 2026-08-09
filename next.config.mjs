import { loadShardConfig, rawGitHubBase } from './scripts/stream-shards.mjs';

const shardConfig = loadShardConfig();
const isEsaStaticExport = process.env.ESA_STATIC_EXPORT === '1';
const distDir = process.env.NEXT_DIST_DIR?.trim();

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

function knightGameRewrites() {
  const gameOrigin = 'https://sui-echoes-below.vercel.app';

  return [
    {
      source: '/knight',
      destination: `${gameOrigin}/`,
    },
    {
      source: '/knight/:path*',
      destination: `${gameOrigin}/:path*`,
    },
  ];
}

/** @type {import('next').NextConfig} */
const nextConfig = isEsaStaticExport
  ? {
      ...(distDir ? { distDir } : {}),
      output: 'export',
      trailingSlash: true,
      images: {
        unoptimized: true,
      },
    }
  : {
      ...(distDir ? { distDir } : {}),
      async rewrites() {
        return {
          beforeFiles: [...knightGameRewrites(), ...streamRewrites()],
          afterFiles: [],
          fallback: [],
        };
      },
    };

export default nextConfig;

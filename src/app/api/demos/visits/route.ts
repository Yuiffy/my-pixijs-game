import { NextResponse } from 'next/server';

import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const visibleGamePaths = [
  '/game/autochess',
  '/game/night-rain',
  '/game/rpg',
  '/game/one-more',
  '/game/flick-chess',
  '/game/hype-harbor',
  '/game/agi',
  '/game/fab',
  '/game/streamer',
  '/game/hush-live',
  '/game/family-pressure',
  '/game/wuxia',
  '/game/brick-excavation',
  '/game/pre-stream',
  '/game/snack',
  '/game/button',
  '/game/jumpone',
];

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({
      available: false,
      localOnly: process.env.NODE_ENV === 'development',
    });
  }

  try {
    const { rows } = await getPool().query<{ path: string; views: string }>(
      `SELECT split_part(path, '?', 1) AS path, COUNT(*)::text AS views
       FROM visits
       WHERE split_part(path, '?', 1) = ANY($1::text[])
       GROUP BY split_part(path, '?', 1)`,
      [visibleGamePaths],
    );
    const counts = Object.fromEntries(
      rows.map(({ path, views }) => [path, Number(views)]),
    );
    return NextResponse.json(
      { available: true, counts },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      },
    );
  } catch (error) {
    console.error('Failed to load demo visit counts:', error);
    return NextResponse.json({ available: false }, { status: 503 });
  }
}

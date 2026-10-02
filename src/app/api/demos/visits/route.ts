import { NextResponse } from 'next/server';

import { gameGroups } from '@/components/gameLibrary/catalog';

import { getPool } from '@/lib/db';

export const dynamic = 'force-dynamic';

const visibleGamePaths = gameGroups.flatMap(group => group.games)
  .filter(game => !game.externalStats).map(game => game.href);

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

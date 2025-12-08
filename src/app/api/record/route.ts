// src/app/api/record/route.ts
import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';

export async function POST(request: NextRequest) {
  // 1. 处理 CORS（允许跨域调用）
  const headers = {
    'Access-Control-Allow-Origin': '*', // 允许任何网站调用，为了安全最好改成你具体的域名
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // 处理 OPTIONS 预检请求
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { headers });
  }

  try {
    const body = await request.json().catch(() => ({})); // 防止解析错误

    // 2. 获取信息
    // Vercel 部署后，真实 IP 在 x-forwarded-for 头里
    const ip = request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';
    // 优先取传过来的 path，没有就存 'api_call'
    const path = body.path || 'unknown_html_page';

    // 3. 写入 Neon 数据库
    await pool.query(
      'INSERT INTO visits (ip, path, user_agent) VALUES ($1, $2, $3)',
      [ip, path, userAgent]
    );

    return NextResponse.json({ success: true }, { headers });
  } catch (error) {
    console.error('Record visit error:', error);
    return NextResponse.json({ success: false }, { status: 500, headers });
  }
}

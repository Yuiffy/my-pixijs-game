import type { Metadata } from 'next';
import SongLibrary from '@/components/songs/SongLibrary';

export const metadata: Metadata = {
  title: '岁己歌单 · 唱歌统计与歌切 | 鹿饼AI直播总结',
  description: '搜索岁己唱过的歌，查看每次演唱的日期、录播时间和已上传的 B 站歌切。',
};

export default function SongsPage() {
  return <SongLibrary />;
}

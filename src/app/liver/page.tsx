'use client';

import Link from 'next/link';
import {
  AppstoreOutlined,
  ArrowRightOutlined,
  HistoryOutlined,
  NumberOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { CSSProperties } from 'react';
import LiverPortrait from '@/components/LiverPortrait';
import {
  getLiverDirectoryMember,
  LIVER_DIRECTORY_GROUPS,
  type LiverDirectoryMember,
} from '@/data/livers/directory';
import styles from './LiverDirectory.module.css';

function renderGroupIcon(groupId: string) {
  switch (groupId) {
    case 'gen28':
      return <NumberOutlined />;
    case 'vrpsp':
      return <HistoryOutlined />;
    case 'gen27':
      return <TeamOutlined />;
    default:
      return <AppstoreOutlined />;
  }
}

export default function LiverIndexPage() {
  const directoryGroups = LIVER_DIRECTORY_GROUPS.map((group) => ({
    ...group,
    members: group.members
      .map(getLiverDirectoryMember)
      .filter((member): member is LiverDirectoryMember => member !== null),
  }));
  const totalMembers = directoryGroups.reduce((total, group) => total + group.members.length, 0);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="返回首页">
          <span className={styles.brandMark}>S</span>
          <span className={styles.brandLabel}>鹿饼AI直播总结</span>
        </Link>
        <div className={styles.topbarActions}>
          <Link
            href="/game/autochess"
            className={styles.easterEgg}
            title="打开自走棋"
            aria-label="让她们打架，打开自走棋"
          >
            <ThunderboltOutlined />
            <span>让她们打架</span>
          </Link>
          <div className={styles.topbarMeta}>
            <span>LIVE ARCHIVE</span>
            <strong>{totalMembers} 位成员</strong>
          </div>
        </div>
      </header>

      <div className={styles.shell}>
        <aside className={styles.sidebar} aria-label="主播分类导航">
          <div>
            <p className={styles.sidebarEyebrow}>BROWSE BY</p>
            <p className={styles.sidebarTitle}>快速定位</p>
          </div>
          <nav className={styles.sidebarNav}>
            {directoryGroups.map((group) => (
              <a key={group.id} href={`#${group.id}`} className={styles.sidebarLink}>
                <span className={styles.sidebarIcon}>{renderGroupIcon(group.id)}</span>
                <span>{group.name}</span>
                <span className={styles.sidebarCount}>{group.members.length}</span>
              </a>
            ))}
          </nav>
          <p className={styles.sidebarNote}>选择成员后进入对应的直播记录页。</p>
        </aside>

        <section className={styles.content} aria-labelledby="liver-directory-title">
          <div className={styles.intro}>
            <div>
              <p className={styles.introEyebrow}>LIVER DIRECTORY / 2026</p>
              <h1 id="liver-directory-title" className={styles.introTitle}>鹿饼AI直播总结</h1>
              <p className={styles.introDescription}>按圈层与期数整理，直接选择要查看的成员。</p>
            </div>
            <div className={styles.introStats} aria-label="目录统计">
              <div className={styles.introStat}>
                <span>分类</span>
                <strong>{directoryGroups.length}</strong>
              </div>
              <div className={styles.introStat}>
                <span>成员</span>
                <strong>{totalMembers}</strong>
              </div>
            </div>
          </div>

          <div className={styles.groupGrid}>
            {directoryGroups.map((group, groupIndex) => {
              const groupStyle = { '--group-accent': group.accent } as CSSProperties;

              return (
                <section
                  key={group.id}
                  id={group.id}
                  className={styles.groupSection}
                  style={groupStyle}
                  aria-labelledby={`${group.id}-title`}
                >
                  <div className={styles.groupHeading}>
                    <div>
                      <div className={styles.groupHeadingMain}>
                        <span className={styles.groupIndex}>{String(groupIndex + 1).padStart(2, '0')}</span>
                        <h2 id={`${group.id}-title`} className={styles.groupName}>{group.name}</h2>
                      </div>
                      <p className={styles.groupNote}>{group.note}</p>
                    </div>
                    <span className={styles.groupCount}>{group.members.length} 位</span>
                  </div>

                  <div className={`${styles.memberGrid} ${group.id === 'vrpsp' ? styles.memberGridDense : ''}`}>
                    {group.members.map((member) => (
                      <Link
                        key={member.liver.id}
                        href={`/liver/${member.liver.id}`}
                        className={styles.memberCard}
                        style={groupStyle}
                        aria-label={`查看${member.displayName}的直播记录`}
                      >
                        <div className={styles.portraitStage}>
                          <LiverPortrait
                            name={member.displayName}
                            primarySrc={member.portraitSrc}
                            fallbackSrc={member.fallbackSrc}
                            accent={group.accent}
                          />
                        </div>
                        <span className={styles.memberCopy}>
                          <span className={styles.memberName}>{member.displayName}</span>
                          <span className={styles.memberFullName}>{member.liver.name}</span>
                        </span>
                        <ArrowRightOutlined className={styles.memberArrow} />
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}

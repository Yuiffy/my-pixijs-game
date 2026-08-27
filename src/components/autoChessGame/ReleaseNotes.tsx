"use client";

import { CloseOutlined, HistoryOutlined } from "@ant-design/icons";
import { AUTOCHESS_RELEASE_HISTORY } from "./version";

interface ReleaseNotesProps {
  open: boolean;
  onClose: () => void;
}

export default function ReleaseNotes({ open, onClose }: ReleaseNotesProps) {
  if (!open) return null;

  return (
    <div className="rift-release-backdrop">
      <button
        type="button"
        className="rift-release-dismiss"
        onClick={onClose}
        aria-label="关闭更新日志"
        title="关闭更新日志"
      />
      <section
        className="rift-release-notes"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rift-release-title"
      >
        <header>
          <HistoryOutlined aria-hidden="true" />
          <div>
            <span>UPDATE LOG // {AUTOCHESS_RELEASE_HISTORY.length} RELEASES</span>
            <h2 id="rift-release-title">版本与更新 · v{AUTOCHESS_RELEASE_HISTORY[0].version}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭更新日志" title="关闭">
            <CloseOutlined aria-hidden="true" />
          </button>
        </header>
        <p>这里记录裂隙阵线每个版本面向玩家的完整改动，最近版本优先显示。</p>
        <div className="rift-release-history">
          {AUTOCHESS_RELEASE_HISTORY.map((release, index) => (
            <article key={release.version} className={`rift-release-entry${index === 0 ? " is-current" : ""}`}>
              <header className="rift-release-entry-header">
                <div>
                  <span>RELEASE // {release.date}</span>
                  <h3>v{release.version} · {release.title}</h3>
                </div>
                {index === 0 && <strong>当前版本</strong>}
              </header>
              <p>{release.summary}</p>
              <div className="rift-release-sections">
                {release.sections.map((section) => (
                  <section key={section.title}>
                    <h4>{section.title}</h4>
                    <ul>
                      {section.items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </section>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

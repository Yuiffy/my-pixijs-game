"use client";

import { CloseOutlined, HistoryOutlined } from "@ant-design/icons";
import { AUTOCHESS_RELEASE } from "./version";

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
            <span>UPDATE LOG // {AUTOCHESS_RELEASE.date}</span>
            <h2 id="rift-release-title">v{AUTOCHESS_RELEASE.version} · {AUTOCHESS_RELEASE.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="关闭更新日志" title="关闭">
            <CloseOutlined aria-hidden="true" />
          </button>
        </header>
        <p>{AUTOCHESS_RELEASE.summary}</p>
        <div className="rift-release-sections">
          {AUTOCHESS_RELEASE.sections.map((section) => (
            <section key={section.title}>
              <h3>{section.title}</h3>
              <ul>
                {section.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          ))}
        </div>
      </section>
    </div>
  );
}

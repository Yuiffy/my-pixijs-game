"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  CheckOutlined,
  CloseOutlined,
  DesktopOutlined,
  FullscreenOutlined,
  HistoryOutlined,
  LinkOutlined,
  ReloadOutlined,
  SoundOutlined,
  AudioMutedOutlined,
} from "@ant-design/icons";
import {
  QUESTIONS,
  THEMES,
  TAGS,
  filterQuestions,
  questionKey,
} from "./content";
import type { Choice, Question, ThemeId } from "./content";
import {
  STORAGE_KEY,
  nextUnanswered,
  parseResult,
  pressPercent,
  readAnswers,
} from "./model";
import type { Answer, Answers, VoteResult } from "./model";
import styles from "./button.module.css";

type Phase = "loading" | "ready" | "saving" | "answered" | "error";
type DebugWindow = Window & {
  render_game_to_text?: () => string;
  advanceTime?: (ms: number) => void;
};

async function requestResult(
  question: Question,
  action: "status" | "vote",
  signal?: AbortSignal,
  choice?: Choice,
) {
  if (process.env.NEXT_PUBLIC_ESA_PAGES === "1") return { mode: "local", choice: null, totals: null } as VoteResult;
  const controller = new AbortController();
  const cancel = () => controller.abort();
  const timer = window.setTimeout(cancel, 15000);
  if (signal?.aborted) cancel();
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    const response = await fetch('/api/button-game', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id: question.id, version: question.version, ...(choice ? { choice } : {}) }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : '统计暂不可用，请重试');
    return parseResult(body);
  } catch (reason) {
    if (controller.signal.aborted && !signal?.aborted) throw new Error('连接超时，选择尚未确认，请重新载入本题');
    if (reason instanceof TypeError) throw new Error('网络连接失败，请重新载入本题');
    if (reason instanceof SyntaxError) throw new Error('统计响应无效，请重新载入本题');
    throw reason;
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

export default function ButtonGame() {
  const [theme, setTheme] = useState<ThemeId>("vtuber");
  const [tag, setTag] = useState("all");
  const [perspective, setPerspective] = useState("all");
  const [currentId, setCurrentId] = useState(QUESTIONS[0].id);
  const [answers, setAnswers] = useState<Answers>({});
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<VoteResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [retry, setRetry] = useState(0);
  const [view, setView] = useState<"play" | "history">("play");
  const [finished, setFinished] = useState(false);
  const [focused, setFocused] = useState(false);
  const [sound, setSound] = useState(false);
  const answersRef = useRef<Answers>({});
  const savingRef = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const pageRef = useRef<HTMLElement>(null);

  const questions = useMemo(
    () => filterQuestions(theme, tag, perspective),
    [theme, tag, perspective],
  );
  const question =
    questions.find((item) => item.id === currentId) || questions[0];
  const key = question ? questionKey(question) : "";
  const themeInfo = THEMES.find((item) => item.id === theme)!;
  const availableTags = Object.keys(TAGS).filter((id) => QUESTIONS.some((item) => item.theme === theme && item.tags.includes(id)),);
  const effectiveAnswers = useMemo(
    () => Object.fromEntries(
        Object.entries(answers).filter(
          ([, answer]) => result?.mode !== "global" || answer.mode === "global",
        ),
      ),
    [answers, result?.mode],
  );
  const done = questions.filter(
    (item) => effectiveAnswers[questionKey(item)],
  ).length;
  const history = Object.values(answers).sort((a, b) => b.at.localeCompare(a.at),);
  const percent = result?.totals ? pressPercent(result.totals) : null;
  const isBusy = phase === "saving";

  const remember = useCallback((answer: Answer) => {
    const updated = { ...answersRef.current, [questionKey(answer)]: answer };
    answersRef.current = updated;
    setAnswers(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
      setNotice("设备存储不可用，本次记录仅在当前页面保留。");
    }
  }, []);

  useEffect(() => {
    let stored: Answers = {};
    try {
      stored = readAnswers(localStorage.getItem(STORAGE_KEY));
    } catch {
      setNotice("设备存储不可用，本次记录仅在当前页面保留。");
    }
    answersRef.current = stored;
    setAnswers(stored);
    const params = new URLSearchParams(window.location.search);
    const linked = QUESTIONS.find((item) => item.id === params.get("q"));
    const selectedTheme = THEMES.some((item) => item.id === params.get("theme"))
      ? (params.get("theme") as ThemeId)
      : "vtuber";
    setTheme(linked?.theme || selectedTheme);
    const initial =
      linked ||
      QUESTIONS.find(
        (item) => item.theme === selectedTheme && !stored[questionKey(item)],
      ) ||
      QUESTIONS.find((item) => item.theme === selectedTheme)!;
    setCurrentId(initial.id);
    setHydrated(true);
    return () => {
      audioRef.current?.close().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (!hydrated || !question) return undefined;
    const controller = new AbortController();
    const url = new URL(window.location.href);
    url.searchParams.set("theme", question.theme);
    url.searchParams.set("q", question.id);
    window.history.replaceState(null, "", url);
    setPhase("loading");
    setResult(null);
    setError("");
    requestResult(question, "status", controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        const saved = answersRef.current[questionKey(question)];
        const choice = data.mode === 'local' ? saved?.choice || null : data.choice;
        setResult({ ...data, choice });
        setPhase(choice ? "answered" : "ready");
        if (data.mode === 'global' && data.choice && (saved?.mode !== 'global' || saved.choice !== data.choice)) {
          remember({
            id: question.id,
            version: question.version,
            choice: data.choice,
            mode: "global",
            at: new Date().toISOString(),
          });
        } else if (data.mode === 'global' && !data.choice && saved?.mode === 'global') {
          remember({ ...saved, mode: 'local' });
        }
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setError(
          reason instanceof Error ? reason.message : "网络连接失败，请重试",
        );
        setPhase("error");
      });
    return () => controller.abort();
  }, [hydrated, question, retry, remember]);

  const playClick = () => {
    if (!sound) return;
    try {
      const context = audioRef.current || new AudioContext();
      audioRef.current = context;
      context.resume().catch(() => setSound(false));
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(420, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(
        130,
        context.currentTime + 0.09,
      );
      gain.gain.setValueAtTime(0.08, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.13);
    } catch {
      setSound(false);
    }
  };

  const vote = async (choice: Choice) => {
    if (!question || phase !== "ready" || savingRef.current) return;
    savingRef.current = true;
    setPhase("saving");
    playClick();
    try {
      const data =
        result?.mode === "local"
          ? result
          : await requestResult(question, "vote", undefined, choice);
      if (result?.mode === 'global' && data.mode !== 'global') {
        throw new Error('全站统计连接已变化，请重新载入本题');
      }
      const confirmed = data.mode === "local" ? choice : data.choice;
      if (!confirmed) throw new Error("选择尚未确认，请重新载入本题");
      remember({
        id: question.id,
        version: question.version,
        choice: confirmed,
        mode: data.mode,
        at: new Date().toISOString(),
      });
      setResult({ ...data, choice: confirmed });
      setPhase("answered");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "网络连接失败，选择尚未确认",
      );
      setPhase("error");
    } finally {
      savingRef.current = false;
    }
  };

  const next = () => {
    if (!question || savingRef.current) return;
    const candidate = nextUnanswered(questions, effectiveAnswers, question.id);
    if (candidate) setCurrentId(candidate.id);
    else setFinished(true);
  };

  const changeFilter = (
    nextTheme: ThemeId,
    nextTag: string,
    nextPerspective: string,
  ) => {
    if (savingRef.current) return;
    setTheme(nextTheme);
    setTag(nextTag);
    setPerspective(nextPerspective);
    setFinished(false);
    const pool = filterQuestions(nextTheme, nextTag, nextPerspective);
    setCurrentId(
      (pool.find((item) => !effectiveAnswers[questionKey(item)]) || pool[0])
        ?.id || "",
    );
  };

  const openQuestion = (item: Question) => {
    changeFilter(item.theme, "all", "all");
    setCurrentId(item.id);
    setView("play");
    setFinished(false);
    setRetry((value) => value + 1);
  };

  const share = async () => {
    if (!question) return;
    const url = new URL(window.location.href);
    url.search = new URLSearchParams({
      theme: question.theme,
      q: question.id,
    }).toString();
    try {
      await navigator.clipboard.writeText(url.toString());
      setNotice("本题链接已复制。");
    } catch {
      setNotice("链接复制失败，可使用当前地址栏链接。");
    }
  };

  const fullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await pageRef.current?.requestFullscreen();
    } catch {
      setNotice("当前浏览器不支持全屏。");
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== "f" ||
        event.repeat ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        /INPUT|TEXTAREA|SELECT/.test((event.target as HTMLElement)?.tagName)
      ) return;
      event.preventDefault();
      fullscreen();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  useEffect(() => {
    const target = window as DebugWindow;
    target.render_game_to_text = () => JSON.stringify({
        mode: view,
        phase,
        theme,
        tag,
        perspective,
        question: question || null,
        choice: result?.choice || null,
        statistics: phase === "answered" ? result?.totals : null,
        statisticsMode: result?.mode || "pending",
        answered: done,
        count: questions.length,
        focused,
        finished,
      });
    target.advanceTime = () => undefined;
    return () => {
      delete target.render_game_to_text;
      delete target.advanceTime;
    };
  }, [
    view,
    phase,
    theme,
    tag,
    perspective,
    question,
    result,
    done,
    questions.length,
    focused,
    finished,
  ]);

  return (
    <main ref={pageRef} className={styles.page} data-focused={focused}>
      <header className={styles.header}>
        <div className={styles.brandGroup}>
          <Link
            className={styles.iconButton}
            href="/demos#games"
            title="返回小游戏"
            aria-label="返回小游戏"
          >
            <ArrowLeftOutlined aria-hidden />
          </Link>
          <Link href="/game/button" className={styles.brand}>
            <span className={styles.brandMark} />
            按钮假说<span className={styles.brandEnglish}>BUTTON / IF</span>
          </Link>
        </div>
        <div className={styles.toolbar}>
          <button
            className={styles.iconButton}
            type="button"
            title={sound ? "关闭音效" : "开启音效"}
            aria-label={sound ? "关闭音效" : "开启音效"}
            aria-pressed={sound}
            onClick={() => setSound((value) => !value)}
          >
            {sound ? <SoundOutlined aria-hidden /> : <AudioMutedOutlined aria-hidden />}
          </button>
          <button
            className={styles.iconButton}
            type="button"
            title={focused ? "退出直播模式" : "直播模式"}
            aria-label={focused ? "退出直播模式" : "直播模式"}
            aria-pressed={focused}
            onClick={() => setFocused((value) => !value)}
          >
            <DesktopOutlined aria-hidden />
          </button>
          <button
            className={styles.iconButton}
            type="button"
            title="切换全屏"
            aria-label="切换全屏"
            onClick={fullscreen}
          >
            <FullscreenOutlined aria-hidden />
          </button>
        </div>
      </header>

      <div className={styles.workspace}>
        <div className={styles.headingRow}>
          <div>
            <p className={styles.eyebrow}>一个按钮，一种平行人生</p>
            <h1>这个按钮，你按吗？</h1>
          </div>
          <div className={styles.views} role="group" aria-label="游戏视图">
            <button
              type="button"
              aria-pressed={view === "play"}
              disabled={isBusy}
              onClick={() => setView("play")}
            >
              做个选择
            </button>
            <button
              type="button"
              aria-pressed={view === "history"}
              disabled={isBusy}
              onClick={() => setView("history")}
            >
              <HistoryOutlined aria-hidden />
              我的记录<span>{history.length}</span>
            </button>
          </div>
        </div>

        {view === "play" ? (
          <>
            <div className={styles.filters}>
              <label className={styles.themeSelect} htmlFor="button-theme">
                主题
                <select
                  id="button-theme"
                  aria-label="选择主题"
                  value={theme}
                  disabled={isBusy}
                  onChange={(event) => changeFilter(event.target.value as ThemeId, "all", "all")}
                >
                  {THEMES.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="button-tag">
                话题
                <select
                  id="button-tag"
                  aria-label="筛选话题"
                  value={tag}
                  disabled={isBusy}
                  onChange={(event) => changeFilter(theme, event.target.value, perspective)}
                >
                  <option value="all">全部话题</option>
                  {availableTags.map((id) => (
                    <option key={id} value={id}>
                      {TAGS[id]}
                    </option>
                  ))}
                </select>
              </label>
              {theme === "vtuber" && (
                <div
                  className={styles.perspectives}
                  role="group"
                  aria-label="选择视角"
                >
                  {(
                    [
                      ["all", "全部视角"],
                      ["streamer", "我是主播"],
                      ["viewer", "我是观众"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      type="button"
                      key={id}
                      disabled={isBusy}
                      aria-pressed={perspective === id}
                      onClick={() => changeFilter(theme, tag, id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.sessionMeta}>
              <span>
                <span className={styles.topicDot} />
                {themeInfo.name}篇<span className={styles.metaDivider}>/</span>
                {themeInfo.subtitle}
              </span>
              <span>
                {done}
                <span className={styles.muted}>
                  {" "}
                  / {questions.length} 已选择
                </span>
              </span>
            </div>

            {finished || !question ? (
              <section className={styles.emptyState}>
                <span className={styles.emptySymbol}>
                  {finished ? <CheckOutlined aria-hidden /> : <CloseOutlined aria-hidden />}
                </span>
                <h2>{finished ? "这组题，选完了。" : "没有符合条件的题目"}</h2>
                <p>
                  {finished
                    ? `${done} 次选择，每一次都是你的答案。`
                    : "换个话题，或者换个视角。"}
                </p>
                <button
                  className={styles.nextButton}
                  type="button"
                  onClick={() => (finished
                      ? setView("history")
                      : changeFilter(theme, "all", "all"))}
                >
                  {finished ? "回看我的选择" : "清除筛选"}
                  <ArrowRightOutlined aria-hidden />
                </button>
                {finished && (
                  <button
                    className={styles.textButton}
                    type="button"
                    onClick={() => {
                      setFinished(false);
                      setCurrentId(questions[0].id);
                    }}
                  >
                    浏览本组题目
                  </button>
                )}
              </section>
            ) : (
              <section
                className={styles.game}
                aria-label="当前题目"
                aria-busy={phase === "loading" || isBusy}
              >
                <div className={styles.questionSide} key={key}>
                  <div className={styles.questionMeta}>
                    <span className={styles.questionNumber}>
                      IF /{" "}
                      {String(
                        QUESTIONS.findIndex((item) => item.id === question.id) +
                          1,
                      ).padStart(3, "0")}
                    </span>
                    <span>
                      {question.perspective === "streamer"
                        ? "主播视角"
                        : question.perspective === "viewer"
                          ? "观众视角"
                          : "生活视角"}
                    </span>
                    <div className={styles.questionTools}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        title="复制本题链接"
                        aria-label="复制本题链接"
                        onClick={share}
                      >
                        <LinkOutlined aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className={styles.gain}>
                    <span className={styles.clauseLabel}>
                      <ArrowUpOutlined aria-hidden />
                      你会得到
                    </span>
                    <h2>{question.gain}</h2>
                  </div>
                  <div className={styles.but}>
                    <span />
                    但是
                    <span />
                  </div>
                  <div className={styles.cost}>
                    <span className={styles.clauseLabel}>代价是</span>
                    <p>{question.cost}</p>
                  </div>
                  <div className={styles.tags}>
                    {question.tags.map((id) => (
                      <span key={id}># {TAGS[id]}</span>
                    ))}
                  </div>
                </div>

                <div className={styles.decisionSide}>
                  {phase === "answered" ? (
                    <div className={styles.result} aria-live="polite">
                      <span className={styles.resultKicker}>你的选择</span>
                      <h2
                        className={
                          result?.choice === "press"
                            ? styles.pressedText
                            : styles.passedText
                        }
                      >
                        {result?.choice === "press"
                          ? "按下。接受这个代价。"
                          : "不按。这样也很好。"}
                      </h2>
                      {result?.mode === "global" && result.totals ? (
                        <>
                          <div className={styles.resultNumbers}>
                            <div>
                              <strong>
                                {percent === null ? "--" : percent}
                                <small>%</small>
                              </strong>
                              <span>选择按下</span>
                            </div>
                            <div>
                              <strong>
                                {percent === null ? "--" : 100 - percent}
                                <small>%</small>
                              </strong>
                              <span>选择不按</span>
                            </div>
                          </div>
                          <div
                            className={styles.resultBar}
                            role="img"
                            aria-label={`按下 ${percent ?? 0}%，不按 ${percent === null ? 0 : 100 - percent}%`}
                          >
                            <span style={{ width: `${percent ?? 0}%` }} />
                          </div>
                          <div className={styles.resultCount}>
                            <span>
                              {result.totals.total.toLocaleString("zh-CN")}{" "}
                              次匿名选择
                            </span>
                            <button
                              type="button"
                              className={styles.iconButton}
                              title="刷新统计"
                              aria-label="刷新统计"
                              onClick={() => setRetry((value) => value + 1)}
                            >
                              <ReloadOutlined aria-hidden />
                            </button>
                          </div>
                          {result.totals.total === 1 && (
                            <p className={styles.resultNote}>
                              你是这道题的第一位投票者。
                            </p>
                          )}
                        </>
                      ) : (
                        <div className={styles.localResult}>
                          <CheckOutlined aria-hidden />
                          <p>本机选择已记录</p>
                          <span>全站统计未连接</span>
                        </div>
                      )}
                      <button
                        type="button"
                        className={styles.nextButton}
                        onClick={next}
                      >
                        {done === questions.length
                          ? "查看本组结果"
                          : "下一道问题"}
                        <ArrowRightOutlined aria-hidden />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className={styles.decisionLabel}>
                        这一次，你的答案是
                      </span>
                      <button
                        type="button"
                        id="press-button"
                        className={styles.pressButton}
                        aria-label="按下按钮"
                        disabled={phase !== "ready"}
                        onClick={() => vote("press")}
                      >
                        <Image
                          src="/games/button/press.svg"
                          alt=""
                          width={480}
                          height={310}
                          priority
                          draggable={false}
                        />
                        <span>{phase === "saving" ? "确认中" : "按下"}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.passButton}
                        disabled={phase !== "ready"}
                        onClick={() => vote("pass")}
                      >
                        <CloseOutlined aria-hidden />
                        我不按
                      </button>
                      {phase === "error" ? (
                        <div className={styles.error} role="alert">
                          <p>{error}</p>
                          <button
                            type="button"
                            onClick={() => setRetry((value) => value + 1)}
                          >
                            <ReloadOutlined aria-hidden />
                            重新载入本题
                          </button>
                        </div>
                      ) : (
                        <span className={styles.connectionState} role="status">
                          {phase === "loading"
                            ? "正在连接..."
                            : isBusy
                              ? "正在确认你的选择..."
                              : result?.mode === "local"
                                ? "本机试玩 · 全站统计未连接"
                                : "全站统计已连接"}
                        </span>
                      )}
                    </>
                  )}
                </div>

                <div className={styles.gameBottom}>
                  <span>
                    {question.source
                      ? "灵感来自一场深夜联动"
                      : "原创题目 / BUTTON IF"}
                  </span>
                  {phase !== "answered" && (
                    <button
                      type="button"
                      className={styles.textButton}
                      disabled={isBusy || questions.length < 2}
                      onClick={next}
                    >
                      先跳过
                      <ArrowRightOutlined aria-hidden />
                    </button>
                  )}
                </div>
              </section>
            )}

            <footer className={styles.footer}>
              <div className={styles.origin}>
                <div className={styles.avatars}>
                  <Image
                    src="/images/livers/sui.png"
                    alt="岁己"
                    width={36}
                    height={36}
                  />
                  <Image
                    src="/images/livers/mofu.jpg"
                    alt="犬绒"
                    width={36}
                    height={36}
                  />
                </div>
                <details>
                  <summary>灵感：岁己 × 犬绒的按钮游戏联动</summary>
                  <p>
                    灵感：2026.09.07 联动，录播约 03:44:58。
                    {question?.source
                      ? `${question.source.time} · ${question.source.note}`
                      : "除标注“直播原梗”的题目外，均为本站原创。"}{" "}
                    非官方同人小游戏。
                  </p>
                </details>
              </div>
              <span className={styles.footerMark}>每个选择，都算数。</span>
            </footer>
          </>
        ) : (
          <section className={styles.history} aria-label="我的选择记录">
            <div className={styles.historyHeading}>
              <h2>那些纠结过的瞬间</h2>
              <span>{history.length} 道题</span>
            </div>
            {history.length ? (
              <div className={styles.historyList}>
                {history.map((answer) => {
                  const item = QUESTIONS.find(
                    (entry) => entry.id === answer.id,
                  )!;
                  return (
                    <button
                      key={questionKey(answer)}
                      type="button"
                      onClick={() => openQuestion(item)}
                      className={styles.historyRow}
                    >
                      <span
                        className={
                          answer.choice === "press"
                            ? styles.pressBadge
                            : styles.passBadge
                        }
                      >
                        {answer.choice === "press" ? (
                          <CheckOutlined aria-hidden />
                        ) : (
                          <CloseOutlined aria-hidden />
                        )}
                        {answer.choice === "press" ? "按下" : "不按"}
                      </span>
                      <span className={styles.historyCopy}>
                        <strong>{item.gain}</strong>
                        <span>但是，{item.cost}</span>
                        <small>
                          {
                            THEMES.find((entry) => entry.id === item.theme)
                              ?.name
                          }{" "}
                          ·{" "}
                          {answer.mode === "global" ? "已计入全站" : "本机记录"}
                        </small>
                      </span>
                      <ArrowRightOutlined aria-hidden />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <HistoryOutlined aria-hidden />
                <h2>还没有做出选择</h2>
                <button
                  type="button"
                  className={styles.nextButton}
                  onClick={() => setView("play")}
                >
                  去看第一道题
                  <ArrowRightOutlined aria-hidden />
                </button>
              </div>
            )}
          </section>
        )}
        {notice && (
          <div className={styles.notice} role="status">
            <span>{notice}</span>
            <button
              type="button"
              title="关闭提示"
              aria-label="关闭提示"
              onClick={() => setNotice("")}
            >
              <CloseOutlined aria-hidden />
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

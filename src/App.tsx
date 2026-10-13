import { deriveProgress } from "./domain/learning";
import { useEffect, useState } from "react";
import { liveQuery } from "dexie";
import {
  Home as HomeIcon,
  Layers,
  Puzzle,
  ChartNoAxesCombined,
  Plus,
  ArrowRight,
  BookOpen,
  X,
  Cloud,
  CloudOff,
  HelpCircle,
  Volume2,
  WifiOff,
} from "lucide-react";
import { LearningProvider, useLearning } from "./app/context";
import { Home } from "./pages/Home";
import { Vocabulary } from "./pages/Vocabulary";
import { Sentences } from "./pages/Sentences";
import { Progress } from "./pages/Progress";
import { WordEditor } from "./components/WordEditor";
import { Study, Quiz, savedSession, type Session } from "./components/Study";
import { Modal } from "./components/common";
import { setMeta, db } from "./data/store";
import { syncAccount } from "./services/cloud";
import { Login } from "./components/Login";
import type { Word } from "./domain/model";
import { SpeechSettings } from "./components/SpeechSettings";
const links = [
  { id: "/", title: "学习首页", Icon: HomeIcon },
  { id: "/vocabulary", title: "词汇学习", Icon: Layers },
  { id: "/sentences", title: "拼句练习", Icon: Puzzle },
  { id: "/progress", title: "学习进度", Icon: ChartNoAxesCombined },
];
function Workspace() {
  const { account, allWords, events, loaded, notice, notify } = useLearning();
  const [route, setRoute] = useState(location.hash.slice(1) || "/");
  const [editor, setEditor] = useState<Word | true | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [quiz, setQuiz] = useState<Word[] | null>(null);
  const [speechSettings, setSpeechSettings] = useState(false);
  const [help, setHelp] = useState(false);
  const [login, setLogin] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncState, setSyncState] = useState("");
  const [resume, setResume] = useState<Session | null>(null);
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const fn = () => {
      setRoute(location.hash.slice(1) || "/");
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  useEffect(() => {
    const sub = liveQuery(async () => {
      const [words, events, config] = await Promise.all([
        db.words.where("account").equals(account).toArray(),
        db.events.where("account").equals(account).toArray(),
        db.configs.get(account),
      ]);
      return (
        words.some((w) => w.dirty) ||
        events.some((e) => e.pending) ||
        !!config?.dirty
      );
    }).subscribe(setPending);
    return () => sub.unsubscribe();
  }, [account]);
  useEffect(() => {
    void savedSession(account).then(setResume);
  }, [account, session]);
  useEffect(() => {
    if (account === "guest" || !online) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const sync = async () => {
      if (!active || document.visibilityState === "hidden") return;
      setSyncState("保存中");
      try {
        await syncAccount(account);
        if (active) setSyncState("已保存到云端");
        failures = 0;
      } catch {
        if (active) setSyncState("保存失败，将自动重试");
        failures++;
      }
      if (active)
        timeout = setTimeout(
          sync,
          Math.min(300000, 30000 * 2 ** Math.min(failures, 3)),
        );
    };
    void sync();
    const foreground = () => {
      if (document.visibilityState === "visible") {
        clearTimeout(timeout);
        void sync();
      }
    };
    document.addEventListener("visibilitychange", foreground);
    return () => {
      active = false;
      clearTimeout(timeout);
      document.removeEventListener("visibilitychange", foreground);
    };
  }, [account, online, pending]);
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let changed = false;
    const onController = () => {
      if (changed) location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onController);
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then((reg) => {
        if (reg.waiting) setUpdate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              setUpdate(worker);
          });
        });
      })
      .catch(() => notify("离线缓存未能启用，联网学习仍可使用。"));
    const updateEvent = () => {
      changed = true;
    };
    window.addEventListener("apply-update", updateEvent);
    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onController,
      );
      window.removeEventListener("apply-update", updateEvent);
    };
  }, []);
  function start(words: Word[], review = false) {
    words = words.filter(
      (w) =>
        w.enrichment !== "pending" &&
        deriveProgress(events, w.id).status !== "known",
    );
    if (!words.length) {
      notify("这组内容已经学过了，可以从词汇页面继续练习或复习。");
      return;
    }
    setSession({
      ids: words.map((w) => w.id),
      index: 0,
      mode: "cards",
      review,
    });
    setQuiz(null);
  }
  function beginQuiz(words: Word[]) {
    words = words.filter(
      (w) =>
        w.enrichment !== "pending" &&
        deriveProgress(events, w.id).status !== "known",
    );
    if (words.length < 2) {
      notify("至少两个词语才能组成选择题，可以先添加更多内容。");
      setSession(null);
      return;
    }
    setQuiz(words);
    setSession(null);
    void setMeta(`${account}:session`, null);
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#/">
          <span className="brand-mark">ท</span>
          <span>
            <b>泰语日常</b>
            <small>THAI EVERYDAY</small>
          </span>
        </a>
        <p className="nav-label">学习空间</p>
        <nav aria-label="主导航">
          {links.map(({ id, title, Icon }) => (
            <a
              key={id}
              href={`#${id}`}
              className={route === id ? "active" : ""}
            >
              <Icon size={20} />
              <span>{title}</span>
              {route === id && <span className="nav-dot" />}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span>ทีละนิด ทุกวัน</span>
            <p>每天一点，慢慢成为习惯。</p>
            <button onClick={() => setHelp(true)}>
              读音标注说明 <ArrowRight size={14} />
            </button>
          </div>
          <button
            className="profile"
            onClick={() => (location.hash = "/progress")}
          >
            <span className="avatar">{account === "guest" ? "我" : "✓"}</span>
            <span>
              <b>我的学习空间</b>
              <small>
                {account === "guest"
                  ? "临时体验 · 刷新清空"
                  : "私人账号 · 自动保存"}
              </small>
            </span>
            <ArrowRight size={15} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            <BookOpen size={17} />
            我的泰语学习 <span>/</span>{" "}
            {links.find((l) => l.id === route)?.title ?? "学习首页"}
          </span>
          <div className="topbar-actions">
            <button
              className="icon-button"
              aria-label="朗读设置"
              title="朗读设置"
              onClick={() => setSpeechSettings(true)}
            >
              <Volume2 size={19} />
            </button>
            <span className="cloud-status">
              {online ? <Cloud size={15} /> : <WifiOff size={15} />}{" "}
              {!online
                ? "离线"
                : account === "guest"
                  ? "临时体验"
                  : syncState.startsWith("保存失败")
                    ? syncState
                    : pending && syncState !== "保存中"
                      ? "等待保存到云端"
                      : syncState || "正在加载云端"}
            </span>
            <button
              className="icon-button"
              onClick={() => setHelp(true)}
              aria-label="读音标注说明"
            >
              <HelpCircle size={19} />
            </button>
            <button
              className="secondary small add-top"
              onClick={() => setEditor(true)}
              disabled={!loaded}
            >
              <Plus size={16} />
              添加词语
            </button>
            {account === "guest" && (
              <button className="primary small" onClick={() => setLogin(true)}>
                登录同步
              </button>
            )}
          </div>
        </header>
        <main className="page-content">
          {!loaded ? (
            <div className="empty">
              <p>正在加载云端学习空间，请保持联网。</p>
              <button className="secondary" onClick={() => location.reload()}>
                重新加载
              </button>
            </div>
          ) : route === "/vocabulary" ? (
            <Vocabulary
              study={start}
              quiz={beginQuiz}
              onEdit={(w) => setEditor(w ?? true)}
            />
          ) : route === "/sentences" ? (
            <Sentences />
          ) : route === "/progress" ? (
            <Progress onLogin={() => setLogin(true)} />
          ) : (
            <>
              {resume && (
                <button
                  className="resume-banner"
                  onClick={() => setSession(resume)}
                >
                  继续上次的词汇学习{" "}
                  <span>
                    第 {resume.index + 1} 张 <ArrowRight size={16} />
                  </span>
                </button>
              )}
              <Home study={start} onAdd={() => setEditor(true)} />
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>THAI EVERYDAY · 学一点，用一点。</span>
          <span>
            <CloudOff size={13} />{" "}
            {account === "guest"
              ? "临时体验，刷新清空"
              : "已登录，自动保存到云端"}
          </span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="手机导航">
        {links.map(({ id, title, Icon }) => (
          <a key={id} href={`#${id}`} className={route === id ? "active" : ""}>
            <Icon size={20} />
            <span>{title}</span>
          </a>
        ))}
      </nav>
      {notice && (
        <div className="toast" role="status">
          <span>{notice}</span>
          <button aria-label="关闭通知" onClick={() => notify("")}>
            <X size={17} />
          </button>
        </div>
      )}
      {update && !session && !quiz && (
        <div className="update-banner">
          有新版本可用{" "}
          <button
            onClick={() => {
              window.dispatchEvent(new Event("apply-update"));
              update.postMessage({ type: "SKIP_WAITING" });
            }}
          >
            更新应用
          </button>
        </div>
      )}
      {editor && (
        <WordEditor
          word={editor === true ? undefined : editor}
          onClose={() => setEditor(null)}
        />
      )}{" "}
      {session && loaded && (
        <Study
          key={`${account}:${session.ids.join(",")}`}
          session={session}
          onClose={() => setSession(null)}
          onQuiz={beginQuiz}
        />
      )}{" "}
      {quiz && <Quiz words={quiz} onClose={() => setQuiz(null)} />}{" "}
      {login && <Login onClose={() => setLogin(false)} />}
      {speechSettings && (
        <Modal title="朗读设置" onClose={() => setSpeechSettings(false)}>
          <SpeechSettings />
        </Modal>
      )}
      {help && (
        <Modal title="罗马音读音说明" onClose={() => setHelp(false)}>
          <div className="help-content">
            <p>罗马音是记忆与发音辅助。泰文原文始终保留，可靠音频优先。</p>
            <h3>声调数字</h3>
            <div className="tone-grid">
              {["¹ 中平调", "² 低调", "³ 降调", "⁴ 高调", "⁵ 升调"].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            <h3>长短音与辅音</h3>
            <p>
              重复元音如 aa、ii、uu、ɔɔ、ɛɛ 表示长元音；kh、ph、th
              表示送气，k、p、t 表示不送气。ng 表示鼻音。ɛ、ɔ、ʉ、ə
              表示英语字母难以准确区分的元音。
            </p>
            <p>
              尾辅音不额外加元音。双元音和特殊拼读需要结合词条说明，不能只靠字母推导泰语读音。
            </p>
            <div className="hint">
              目前内置词条及标注是待核对样例，不是经过专业审核的发音教材。你可以在词汇页面逐条修正。
            </div>
            <p className="muted">
              这是本应用的辅助标注约定，并非官方转写标准；规范版本为 1。
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
function AccountWorkspace() {
  const { account, epoch } = useLearning();
  return <Workspace key={`${account}:${epoch ?? -1}`} />;
}
export default function App() {
  return (
    <LearningProvider>
      <AccountWorkspace />
    </LearningProvider>
  );
}

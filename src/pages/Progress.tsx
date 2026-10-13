import { LongTermGoals } from "../components/LongTermGoals";
import { useState, useRef } from "react";
import {
  Download,
  Upload,
  Cloud,
  BookOpen,
  Flame,
  CheckCheck,
} from "lucide-react";
import { useLearning } from "../app/context";
import { deriveProgress, dateKey, streak } from "../domain/learning";
import {
  exportBackup,
  importBackup,
  copyGuestTo,
  clearAccount,
  db,
} from "../data/store";
import { statusName } from "./Vocabulary";
import { exercises, personalExercises } from "../content/course";
import { cloud, syncAccount } from "../services/cloud";
export function Progress({ onLogin }: { onLogin: () => void }) {
  const { allWords, events, settings, putSettings, account, notify } =
    useLearning();
  const [goal, setGoal] = useState(String(settings.goal));
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const stats = allWords.map((w) => deriveProgress(events, w.id));
  const learned = stats.filter((p) => p.status !== "new").length;
  const mastered = stats.filter((p) => p.status === "mastered").length;
  const correct = events.filter(
    (e) =>
      e.result === "correct" &&
      !e.assisted &&
      !["known", "restore"].includes(e.mode),
  ).length;
  const days = Array.from(
    { length: 7 },
    (_, i) => Date.now() - (6 - i) * 86400000,
  );
  const counts = days.map(
    (day) => events.filter((e) => dateKey(e.at) === dateKey(day)).length,
  );
  const max = Math.max(5, ...counts);
  async function download() {
    try {
      const b = await exportBackup(account);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(b, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `thai-learning-${dateKey(Date.now())}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      notify("导出失败，请重试。");
    }
  }
  async function upload(file: File) {
    if (file.size > 20 * 1024 * 1024) {
      notify("文件过大，请使用 20 MB 以下的备份。");
      return;
    }
    setBusy(true);
    try {
      await importBackup(account, JSON.parse(await file.text()));
      notify("备份已合并，已有学习记录按 ID 去重。");
    } catch {
      notify("无法导入：备份格式不正确。原有数据未被修改。");
    } finally {
      setBusy(false);
    }
  }
  async function sync() {
    setBusy(true);
    try {
      await syncAccount(account);
      notify("同步完成，冲突编辑会保留为词库中的副本。");
    } catch (e) {
      notify(e instanceof Error ? e.message : "同步失败，数据仍保存在本机。");
    } finally {
      setBusy(false);
    }
  }
  async function saveGoal() {
    const n = Number(goal);
    if (!Number.isInteger(n) || n < 1 || n > 200) {
      notify("每日目标请输入 1 到 200 之间的整数。");
      setGoal(String(settings.goal));
      return;
    }
    try {
      await putSettings({ ...settings, goal: n });
    } catch {
      notify("目标保存失败。");
    }
  }
  async function clear() {
    if (
      !confirm(
        "清除当前账号在此浏览器的记录？建议先导出备份。云端数据不会被删除，重新同步后可下载。",
      )
    )
      return;
    const pending =
      (await db.events.where("account").equals(account).toArray()).some(
        (e) => e.pending,
      ) ||
      (await db.words.where("account").equals(account).toArray()).some(
        (w) => w.dirty,
      );
    if (
      pending &&
      !confirm("存在尚未同步的数据。继续会丢失这些本地修改，确定已备份吗？")
    )
      return;
    await clearAccount(account);
    notify("本机数据已清除。");
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVERY SMALL STEP COUNTS</p>
          <h1>看见你的积累。</h1>
          <p className="muted">学习不是一条直线，持续回来就有进步。</p>
        </div>
      </div>
      <div className="stats-row progress-stats">
        <div className="stat-card">
          <span className="stat-icon sage">
            <BookOpen />
          </span>
          <div>
            <span className="stat-number">
              {learned}
              <small> 个</small>
            </span>
            <p>学习过的词语</p>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon peach">
            <Flame />
          </span>
          <div>
            <span className="stat-number">
              {streak(events)}
              <small> 天</small>
            </span>
            <p>连续学习</p>
          </div>
        </div>
        <div className="stat-card">
          <span className="stat-icon lavender">
            <CheckCheck />
          </span>
          <div>
            <span className="stat-number" data-testid="attempt-total">
              {events.length}
            </span>
            <p>有效练习记录</p>
          </div>
        </div>
      </div>
      <LongTermGoals />
      <div className="progress-layout">
        <section className="panel">
          <h2>过去 7 天</h2>
          <p className="muted">每次回忆，都是一次积累。</p>
          <div className="bar-chart" aria-label="过去七天练习次数">
            {days.map((day, i) => (
              <div className="bar-column" key={i}>
                <span>{counts[i]}</span>
                <div className="bar-space">
                  <div
                    className={i === 6 ? "today" : ""}
                    style={{
                      height: `${Math.max(3, (counts[i] / max) * 100)}%`,
                    }}
                  />
                </div>
                <small>
                  {i === 6
                    ? "今天"
                    : new Intl.DateTimeFormat("zh-CN", {
                        weekday: "short",
                        timeZone: "Asia/Bangkok",
                      }).format(day)}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2>词汇掌握情况</h2>
          <div className="mastery-line">
            {Object.entries(statusName).map(([key, label]) => {
              const n = stats.filter((p) => p.status === key).length;
              return (
                <div key={key}>
                  <span className={`status ${key}`}>{label}</span>
                  <b>{n}</b>
                  <div className="progress-track">
                    <span
                      style={{
                        width: `${allWords.length ? (n / allWords.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <p className="muted">
            已掌握 {mastered} 个 · 独立答对 {correct} 次
          </p>
        </section>
        <section className="panel">
          <h2>句型单独积累</h2>
          <p className="muted">单词熟悉了，还要练习把它们连起来。</p>
          <div className="pattern-list">
            {[...exercises, ...personalExercises(allWords)].map((ex) => {
              const p = deriveProgress(events, ex.id);
              return (
                <div key={ex.id}>
                  <span>{ex.prompt}</span>
                  <span className={`status ${p.status}`}>
                    {statusName[p.status]}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="panel settings-panel">
          <h2>按你的节奏学习</h2>
          <label>
            每日学习目标
            <input
              aria-label="每日学习目标"
              type="number"
              min="1"
              max="200"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onBlur={() => void saveGoal()}
            />
          </label>
          <p className="muted small-text">
            按每天练习过的不同词语和句型计数，随时可改。
          </p>
          <label>
            默认文字显示
            <select
              value={settings.display}
              onChange={(e) =>
                void putSettings({
                  ...settings,
                  display: e.target.value as typeof settings.display,
                })
              }
            >
              <option value="both">泰文与罗马音并列</option>
              <option value="roman">罗马音优先</option>
              <option value="thai">泰文优先</option>
            </select>
          </label>
          <p className="muted small-text">
            学习日期按泰国时间计算。复习间隔：1、3、7、14、30、60 天。
          </p>
        </section>
      </div>
      <section className="panel sync-panel">
        <div>
          <h2>
            <Cloud size={21} />
            数据与同步
          </h2>
          <p className="muted">
            {!cloud
              ? "目前使用本地模式。配置 Supabase 后可登录同步。"
              : account === "guest"
                ? "登录后，手机和电脑可以共用私人词库与进度。"
                : "已登录。每次练习先保存在本机，再联网同步。"}
          </p>
        </div>
        <div className="button-row">
          {cloud &&
            (account === "guest" ? (
              <button className="primary" onClick={onLogin}>
                使用邮箱登录
              </button>
            ) : (
              <>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void sync()}
                >
                  {busy ? "同步中…" : "立即同步"}
                </button>
                <button
                  className="secondary"
                  onClick={() =>
                    void copyGuestTo(account)
                      .then(() => notify("本机访客记录已合并到账号。"))
                      .catch(() => notify("合并失败。"))
                  }
                >
                  合并本机访客记录
                </button>
                <button
                  className="secondary"
                  onClick={() => void cloud?.auth.signOut()}
                >
                  退出登录
                </button>
              </>
            ))}
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void download()}
          >
            <Download size={16} />
            导出备份
          </button>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <Upload size={16} />
            导入备份
          </button>
          <input
            ref={input}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
        </div>
        <button
          className="text-button danger"
          onClick={() => void clear().catch(() => notify("清除失败，请重试。"))}
        >
          清除本机数据
        </button>
      </section>
    </>
  );
}

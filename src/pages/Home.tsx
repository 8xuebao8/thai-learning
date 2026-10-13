import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Clock3,
  Flame,
  Layers,
  BriefcaseBusiness,
  GraduationCap,
  MapPin,
} from "lucide-react";
import { useLearning } from "../app/context";
import { deriveProgress, dateKey, streak } from "../domain/learning";
import { units, exercises } from "../content/course";
import { SectionTitle } from "../components/common";
import type { Word } from "../domain/model";
export function Home({
  study,
  onAdd,
}: {
  study: (words: Word[], review?: boolean) => void;
  onAdd: () => void;
}) {
  const { allWords, events, settings } = useLearning();
  const today = new Set(
    events
      .filter((e) => dateKey(e.at) === dateKey(Date.now()))
      .map((e) => e.itemId),
  ).size;
  const due = allWords.filter((w) => deriveProgress(events, w.id).due);
  const learned = allWords.filter(
    (w) => deriveProgress(events, w.id).status !== "new",
  ).length;
  const icons = [BriefcaseBusiness, GraduationCap, MapPin];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR EVERYDAY THAI</p>
          <h1>让泰语，走进你的日常。</h1>
          <p className="muted">从熟悉的生活出发，每天多懂一点，多说一点。</p>
        </div>
        <span className="date-chip">
          {new Intl.DateTimeFormat("zh-CN", {
            month: "long",
            day: "numeric",
            weekday: "long",
            timeZone: "Asia/Bangkok",
          }).format(new Date())}
        </span>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-badge">
            <Sparkles size={15} /> 少量练习，持续进步
          </span>
          <h2>
            今天的表达，
            <br />
            从一个新词开始。
          </h2>
          <p>
            看泰文，读罗马音，把词汇变成
            <br className="desktop-break" />
            真正说得出口的句子。
          </p>
          <button
            className="primary"
            onClick={() =>
              study(
                allWords
                  .filter(
                    (w) =>
                      w.enrichment !== "pending" &&
                      deriveProgress(events, w.id).status === "new",
                  )
                  .slice(0, Math.max(1, settings.goal - today)),
              )
            }
          >
            开始学习 <ArrowRight size={18} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="art-card art-back">每天一点</div>
          <div className="art-card art-front">
            <span className="art-label">A WORD FOR TODAY</span>
            <span className="art-thai">เรียนรู้</span>
            <span className="art-roman">rian¹-ruu⁴</span>
            <span className="art-meaning">学习 · 了解</span>
            <span className="art-line" />
          </div>
          <span className="art-spark">✦</span>
        </div>
      </section>
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-icon sage">
            <Layers />
          </span>
          <div>
            <span className="stat-number">
              {learned}
              <small> 个</small>
            </span>
            <p>已学习词汇</p>
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
        <div className="stat-card goal-card">
          <span className="stat-icon lavender">
            <Clock3 />
          </span>
          <div>
            <span className="stat-number">
              {today}
              <small> / {settings.goal}</small>
            </span>
            <p>今日学习目标</p>
          </div>
          <div className="mini-progress">
            <span
              style={{
                width: `${Math.min(100, (today / settings.goal) * 100)}%`,
              }}
            />
          </div>
        </div>
      </div>
      <div className="home-grid">
        <section>
          <SectionTitle
            eyebrow="A LITTLE, EVERY DAY"
            title="你的学习主题"
            action="全部词汇"
            onAction={() => (location.hash = "/vocabulary")}
          />
          <div className="unit-list">
            {units.map((unit, i) => {
              const Icon = icons[i];
              const words = allWords.filter((w) => w.theme === unit.id);
              const done = words.filter(
                (w) => deriveProgress(events, w.id).status !== "new",
              ).length;
              return (
                <button
                  key={unit.id}
                  className="unit-card"
                  onClick={() => study(words)}
                >
                  <span className={`unit-icon ${unit.color}`}>
                    <Icon size={25} />
                  </span>
                  <div className="unit-copy">
                    <span className="unit-number">UNIT 0{i + 1}</span>
                    <h3>{unit.title}</h3>
                    <p>{unit.description}</p>
                    <div className="unit-bottom">
                      <span>
                        {words.length} 个词语 ·{" "}
                        {exercises.filter((e) => e.theme === unit.id).length}{" "}
                        个句型
                      </span>
                      <span>
                        {done}/{words.length}
                      </span>
                    </div>
                    <div className="progress-track">
                      <span
                        style={{
                          width: `${words.length ? (done / words.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                  <ArrowUpRight size={21} />
                </button>
              );
            })}
          </div>
        </section>
        <aside className="home-aside">
          <section className="review-panel">
            <span className="tiny-label">KEEP IT FRESH</span>
            <div className="review-symbol">
              <Clock3 size={28} />
            </div>
            <h3>
              {due.length ? "温故，也是一种进步。" : "记住，从复习开始。"}
            </h3>
            <p>
              {due.length
                ? `${due.length} 个词语到了复习时间。先巩固，再继续。`
                : "学过的词语会按掌握情况安排复习，到了时间会出现在这里。"}
            </p>
            <button
              className="secondary"
              disabled={!due.length}
              onClick={() => study(due, true)}
            >
              {due.length ? `复习 ${due.length} 个词语` : "暂时没有到期词语"}
              <ArrowRight size={16} />
            </button>
          </section>
          <section className="personal-panel">
            <span className="tiny-label">MAKE IT YOURS</span>
            <h3>把遇见的词，留下来。</h3>
            <p>聊天、课堂或工作里遇到的新词，都可以成为你的下一张学习卡。</p>
            <button className="text-button" onClick={onAdd}>
              添加到我的词库 <ArrowRight size={16} />
            </button>
          </section>
        </aside>
      </div>
      <p className="content-note">
        首批内容为待核对学习样例。罗马音辅助发音，不替代泰文与可靠音频。
      </p>
    </>
  );
}

import { useEffect, useState, useRef } from "react";
import {
  Volume2,
  Square,
  LoaderCircle,
  X,
  BookOpen,
  ArrowRight,
} from "lucide-react";
import { useLearning } from "../app/context";
import { playSpeech, stopSpeech, useSpeech } from "../services/speech";
export function AudioButton({
  text,
  compact = false,
  label = "听听发音",
}: {
  text: string;
  compact?: boolean;
  label?: string;
}) {
  const { notify } = useLearning();
  const owner = useRef(Symbol("speech-button")).current;
  const speech = useSpeech();
  const mine = speech.owner === owner;
  const loading = mine && speech.status === "loading";
  const playing = mine && speech.status === "playing";
  useEffect(() => () => stopSpeech(owner), [owner, text]);
  const description = loading
    ? "取消加载"
    : playing
      ? "停止朗读"
      : label === "试听泰语"
        ? label
        : "播放泰语";
  return (
    <button
      className={compact ? "icon-button" : "audio-button"}
      onClick={() =>
        loading || playing ? stopSpeech(owner) : playSpeech(text, owner, notify)
      }
      aria-label={description}
      aria-pressed={loading || playing}
      title={
        loading
          ? "正在等待语音，点击取消"
          : playing
            ? "正在朗读，点击停止"
            : "播放泰语；声音可在网页朗读设置中更换"
      }
    >
      {loading ? (
        <LoaderCircle className="speech-spinner" size={18} />
      ) : playing ? (
        <Square size={18} />
      ) : (
        <Volume2 size={compact ? 18 : 22} />
      )}
      {!compact && (loading ? "加载声音…" : playing ? "停止朗读" : label)}
    </button>
  );
}
export function Script({
  thai,
  roman,
  className = "",
  controls = true,
  forceReveal = false,
}: {
  thai: string;
  roman: string;
  className?: string;
  controls?: boolean;
  forceReveal?: boolean;
}) {
  const { settings } = useLearning();
  const [reveal, setReveal] = useState(false);
  return (
    <div className={`script ${className}`}>
      {(settings.display !== "roman" || reveal || forceReveal) && (
        <span lang="th" className="thai">
          {thai}
        </span>
      )}
      {(settings.display !== "thai" || reveal || forceReveal) && (
        <span className="roman">{roman}</span>
      )}
      {controls && settings.display !== "both" && (
        <button className="text-button" onClick={() => setReveal(!reveal)}>
          {reveal
            ? "收起辅助读音"
            : settings.display === "thai"
              ? "显示罗马音"
              : "显示泰文"}
        </button>
      )}
    </div>
  );
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty">
      <BookOpen size={32} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", fn);
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", fn);
      document.body.style.overflow = old;
    };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="关闭窗口"
          >
            <X />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function SectionTitle({
  eyebrow,
  title,
  action,
  onAction,
}: {
  eyebrow?: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowRight size={16} />
        </button>
      )}
    </div>
  );
}

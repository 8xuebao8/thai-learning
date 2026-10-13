import { useEffect, useState } from "react";
import { Volume2, X, BookOpen, ArrowRight } from "lucide-react";
import { useLearning } from "../app/context";
export function AudioButton({
  text,
  compact = false,
}: {
  text: string;
  compact?: boolean;
}) {
  const { notify } = useLearning();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const update = () => setVoices(speechSynthesis.getVoices());
    update();
    speechSynthesis.addEventListener("voiceschanged", update);
    return () => {
      speechSynthesis.removeEventListener("voiceschanged", update);
      speechSynthesis.cancel();
    };
  }, []);
  const voice = voices.find((v) => v.lang.toLowerCase().startsWith("th"));
  function speak() {
    if (!voice) {
      notify("当前设备没有可用的泰语语音，音频暂不可用。其他练习可以继续。");
      return;
    }
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = "th-TH";
    u.rate = 0.82;
    u.onend = () => setPlaying(false);
    u.onerror = () => {
      setPlaying(false);
      notify("播放失败，请稍后重试。");
    };
    setPlaying(true);
    speechSynthesis.speak(u);
  }
  return (
    <button
      className={compact ? "icon-button" : "audio-button"}
      onClick={speak}
      aria-label="播放泰语"
      title={voice ? "播放泰语" : "此设备尚无泰语语音"}
    >
      <Volume2 size={compact ? 18 : 22} />
      {!compact && (playing ? "播放中…" : "听听发音")}
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

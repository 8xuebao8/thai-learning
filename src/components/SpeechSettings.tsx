import { useEffect, useRef } from "react";
import { Volume2, Square } from "lucide-react";
import {
  useSpeech,
  selectedVoice,
  setSpeechPreferences,
  refreshVoices,
  playSpeech,
  stopSpeech,
} from "../services/speech";
export function SpeechSettings() {
  const speech = useSpeech();
  const owner = useRef(Symbol("speech-preview")).current;
  const voice = selectedVoice();
  const active =
    speech.owner === owner && ["loading", "playing"].includes(speech.status);
  useEffect(() => () => stopSpeech(owner), [owner]);
  return (
    <div className="speech-settings">
      <p className="muted">
        免费使用当前浏览器提供的泰语声音。以下选择只影响本网站，不修改电脑或浏览器设置。
      </p>
      <label>
        泰语声音
        <select
          aria-label="泰语声音"
          value={voice?.voiceURI ?? ""}
          disabled={!speech.voices.length}
          onChange={(e) => setSpeechPreferences(e.target.value, speech.rate)}
        >
          {!speech.voices.length && (
            <option value="">没有可用的泰语声音</option>
          )}
          {speech.voices.map((v) => (
            <option key={v.voiceURI} value={v.voiceURI}>
              {v.name} · {v.localService ? "本地声音" : "联网声音"}
            </option>
          ))}
        </select>
      </label>
      {speech.voiceURI &&
        !speech.voices.some((v) => v.voiceURI === speech.voiceURI) && (
          <p role="status">
            上次选择的声音当前不可用，已临时使用列表中的声音。
          </p>
        )}
      <label>
        朗读速度
        <select
          aria-label="朗读速度"
          value={speech.rate}
          onChange={(e) =>
            setSpeechPreferences(voice?.voiceURI ?? "", Number(e.target.value))
          }
        >
          <option value="1">原速（建议先试听）</option>
          <option value="0.8">慢速</option>
        </select>
      </label>
      <p lang="th" className="thai speech-sample">
        สวัสดี วันนี้เราจะประชุม
      </p>
      <div className="button-row">
        <button
          className="primary"
          disabled={!voice || !speech.supported}
          aria-label={
            active
              ? speech.status === "loading"
                ? "取消加载"
                : "停止朗读"
              : "试听泰语"
          }
          onClick={() =>
            active
              ? stopSpeech(owner)
              : playSpeech("สวัสดี วันนี้เราจะประชุม", owner, () => {})
          }
        >
          {active ? <Square size={18} /> : <Volume2 size={18} />}
          {active
            ? speech.status === "loading"
              ? "加载声音…"
              : "停止朗读"
            : "试听泰语"}
        </button>
        <button className="secondary" onClick={refreshVoices}>
          刷新声音列表
        </button>
      </div>
      {speech.error && <p role="alert">{speech.error}</p>}
      {!speech.supported ? (
        <p role="status">此浏览器不支持网页朗读。</p>
      ) : !voice ? (
        <p role="status">
          当前浏览器没有可用的泰语声音。刷新列表后仍为空时，本设备暂时无法使用免费网页合成朗读。
        </p>
      ) : (
        <p className="muted small-text">
          听起来失真或没有声音？换一个泰语声音再试听。浏览器的“播放中”状态不能保证扬声器实际出声；我们不会自动安装声音或更改系统设置。联网声音可能需要等待，离线时请选本地声音。
        </p>
      )}
    </div>
  );
}

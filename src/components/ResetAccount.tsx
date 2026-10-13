import { useRef, useState } from "react";
import { Modal } from "./common";
import { useLearning } from "../app/context";
import { resetAccount } from "../services/cloud";
export function ResetAccount() {
  const { account, epoch, notify } = useLearning();
  const [step, setStep] = useState(0);
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef("");
  async function reset() {
    if (busy || phrase !== "确认初始化" || epoch === undefined) return;
    setBusy(true);
    setError("");
    try {
      await resetAccount(account, epoch, request.current);
      notify("初始化完成，账号和系统课程已保留。");
      setStep(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "初始化未完成，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="secondary danger"
        onClick={() => {
          request.current = crypto.randomUUID();
          setPhrase("");
          setError("");
          setStep(1);
        }}
      >
        一键初始化
      </button>
      {step > 0 && (
        <Modal
          title={
            step === 1 ? "初始化账号 · 第一次确认" : "初始化账号 · 第二次确认"
          }
          onClose={() => {
            if (!busy) setStep(0);
          }}
        >
          <p>
            将永久清空当前账号的个人词库、学习记录、已认识标记、总目标和学习设置。
          </p>
          <p>
            登录账号与系统自带课程会保留。所有设备都将使用初始化后的数据，此操作无法撤销。
          </p>
          {step === 1 ? (
            <div className="button-row">
              <button className="secondary" onClick={() => setStep(0)}>
                取消
              </button>
              <button className="primary danger" onClick={() => setStep(2)}>
                我了解，继续确认
              </button>
            </div>
          ) : (
            <>
              <label>
                请输入“确认初始化”
                <input
                  aria-label="初始化确认文字"
                  value={phrase}
                  disabled={busy}
                  onChange={(e) => setPhrase(e.target.value)}
                />
              </label>
              {error && (
                <p role="alert">
                  {error} 网络中断时结果可能尚未确认，重试不会重复初始化。
                </p>
              )}
              <div className="button-row">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setStep(0)}
                >
                  取消
                </button>
                <button
                  className="primary danger"
                  disabled={busy || phrase !== "确认初始化"}
                  onClick={() => void reset()}
                >
                  {busy ? "正在初始化…" : "第二次确认并初始化"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  );
}

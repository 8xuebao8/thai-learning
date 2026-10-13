import { useState } from "react";
import { Eye, EyeOff, Mail, LockKeyhole } from "lucide-react";
import { Modal } from "./common";
import { cloud, signInWithEmail } from "../services/cloud";
import { useLearning } from "../app/context";
export function Login({ onClose }: { onClose: () => void }) {
  const { notify } = useLearning();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await signInWithEmail(email, password);
      setPassword("");
      notify("登录成功。访客记录仍保留在本机，可在学习进度页合并。");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "登录失败，请重试。");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="邮箱登录"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="muted">
          登录后，在手机和电脑之间同步你的私人词库与进度。
        </p>
        <label>
          <span className="button-row">
            <Mail size={15} />
            登录邮箱
          </span>
          <input
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </label>
        <label>
          <span className="button-row">
            <LockKeyhole size={15} />
            登录密码
          </span>
          <input
            type={show ? "text" : "password"}
            autoComplete="current-password"
            required
            maxLength={4096}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() => setShow(!show)}
        >
          {show ? <EyeOff size={15} /> : <Eye size={15} />}{" "}
          {show ? "隐藏密码" : "显示密码"}
        </button>
        {!cloud && (
          <p className="hint">
            尚未配置 Supabase。你可以继续本机学习，配置后再登录。
          </p>
        )}
        <p className="form-note">
          个人使用版只接受已创建的学习账号。登录密码与 Supabase
          数据库密码是两回事。
        </p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            className="secondary"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            取消
          </button>
          <button className="primary" disabled={busy || !cloud}>
            {busy ? "正在登录…" : "登录并同步"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

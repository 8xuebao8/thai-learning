import { useState } from "react";
import { useLearning } from "../app/context";
import { activeThemes, catalogFor, resolveTheme } from "../domain/themes";
import type { ChangePackage } from "./contract";
export function ThemeManager({
  busy,
  scope = "words",
  onPreview,
}: {
  busy: boolean;
  scope?: "words" | "sentences";
  onPreview: (ops: ChangePackage["operations"]) => void;
}) {
  const { settings, allWords } = useLearning();
  const catalog = catalogFor(settings, scope),
    topics = activeThemes(catalog);
  const [open, setOpen] = useState(false),
    [mode, setMode] = useState("theme_add");
  const [source, setSource] = useState("work"),
    [target, setTarget] = useState("personal");
  const [name, setName] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const sourceId = topics.some((t) => t.id === source) ? source : "personal";
  const targetId = topics.some((t) => t.id === target) ? target : "personal";
  const words = allWords.filter(
    (w) =>
      !!w.sentence === (scope === "sentences") &&
      resolveTheme(w.theme, catalog) === sourceId,
  );
  const chosen = words.filter((w) => selected.includes(w.id));
  function preview() {
    if (mode === "theme_add")
      onPreview([
        { action: "theme_add", id: `custom:${crypto.randomUUID()}`, name },
      ]);
    if (mode === "theme_rename")
      onPreview([{ action: "theme_rename", id: sourceId, name }]);
    if (mode === "theme_delete")
      onPreview([{ action: "theme_delete", id: sourceId, moveTo: targetId }]);
    if (mode === "move")
      onPreview(
        chosen.map((w) => ({
          action: "move",
          id: w.id,
          expectedVersion: w.version,
          theme: targetId,
        })),
      );
  }
  return (
    <div className="theme-manager">
      <button
        className="secondary"
        disabled={busy}
        onClick={() => setOpen(!open)}
      >
        {scope === "sentences"
          ? "管理句库主题与移动句子"
          : "管理主题与移动词语"}
      </button>
      {open && (
        <div className="theme-form">
          <label>
            主题操作
            <select
              aria-label="主题操作"
              value={mode}
              disabled={busy}
              onChange={(e) => {
                setMode(e.target.value);
                setSelected([]);
                setName("");
              }}
            >
              <option value="theme_add">新建主题</option>
              <option value="theme_rename">重命名主题</option>
              <option value="theme_delete">删除主题并迁移内容</option>
              <option value="move">批量移动词语</option>
            </select>
          </label>
          {mode !== "theme_add" && (
            <label>
              原主题
              <select
                aria-label="原主题"
                value={sourceId}
                disabled={busy}
                onChange={(e) => {
                  setSource(e.target.value);
                  setSelected([]);
                }}
              >
                {topics.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(mode === "theme_add" || mode === "theme_rename") && (
            <label>
              主题名称
              <input
                value={name}
                maxLength={60}
                disabled={busy}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如：旅游与出行"
              />
            </label>
          )}
          {(mode === "theme_delete" || mode === "move") && (
            <label>
              目标主题
              <select
                aria-label="目标主题"
                value={targetId}
                disabled={busy}
                onChange={(e) => setTarget(e.target.value)}
              >
                {topics.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {mode === "theme_delete" && (
            <p>
              删除主题后，仅本资料库内容迁往所选主题，学习记录保留，另一资料库不受影响。归档主题（ID：personal）不能删除。
            </p>
          )}
          {mode === "move" && (
            <fieldset className="theme-word-list">
              <legend>选择内容（每批最多100个）</legend>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() =>
                  setSelected(words.slice(0, 100).map((w) => w.id))
                }
              >
                选择前100个
              </button>
              {words.map((w) => (
                <label key={w.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(w.id)}
                    disabled={
                      busy || (!selected.includes(w.id) && chosen.length >= 100)
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, w.id]
                          : selected.filter((id) => id !== w.id),
                      )
                    }
                  />
                  <span>
                    {w.thai} · {w.chinese || "待补全"}
                  </span>
                </label>
              ))}
              {!words.length && <p>这个主题还没有可移动的个人内容。</p>}
            </fieldset>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              ((mode === "theme_add" || mode === "theme_rename") &&
                !name.trim()) ||
              (mode === "move" && !chosen.length)
            }
            onClick={preview}
          >
            预览主题修改
          </button>
        </div>
      )}
    </div>
  );
}

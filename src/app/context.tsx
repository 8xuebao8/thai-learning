import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { liveQuery } from "dexie";
import {
  loadData,
  watchGuest,
  clearAccount,
  saveEvent,
  saveWord,
  saveSettings,
  getMeta,
  setMeta,
  type Data,
} from "../data/store";
import {
  defaultSettings,
  type Word,
  type LearningEvent,
  type Settings,
} from "../domain/model";
import { cloud, initializeAuth, syncAccount } from "../services/cloud";
import { courseWords } from "../content/course";
type Context = Data & {
  account: string;
  setAccount: (s: string) => void;
  allWords: Word[];
  record: (
    id: string,
    kind: "word" | "sentence",
    correct: boolean,
    assisted?: boolean,
    mode?: string,
    continuation?: { key: string; value: unknown },
  ) => Promise<void>;
  putWord: (w: Word) => Promise<void>;
  putSettings: (s: Settings) => Promise<void>;
  notice: string;
  notify: (s: string) => void;
  loaded: boolean;
};
const LearningContext = createContext<Context>(null!);
export function LearningProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState("guest");
  const [data, setData] = useState<Data>({
    words: [],
    events: [],
    settings: defaultSettings,
  });
  const [loaded, setLoaded] = useState(false);
  const [notice, notify] = useState("");
  const [authReady, setAuthReady] = useState(!cloud);
  const [readyAccount, setReadyAccount] = useState("");
  useEffect(() => {
    if (!cloud) return;
    let active = true;
    let authEvent = false;
    void initializeAuth()
      .then((s) => {
        if (active && !authEvent) {
          setAccount(s?.user.id ?? "guest");
          setAuthReady(true);
        }
      })
      .catch(() => {
        if (active) {
          notify("登录状态读取失败，请刷新重试。");
          setAuthReady(true);
        }
      });
    const { data } = cloud.auth.onAuthStateChange((_event, s) => {
      authEvent = true;
      setAccount(s?.user.id ?? "guest");
      setAuthReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setReadyAccount("");
    // Discard both this page's demo and any guest records left by the old version.
    void clearAccount("guest").catch(() => {});
    if (account === "guest") {
      setReadyAccount(account);
      return;
    }
    let retry: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      clearTimeout(retry);
      try {
        await syncAccount(account);
        if (active) setReadyAccount(account);
      } catch {
        if (active) {
          notify("云端数据加载失败，恢复网络后会自动重试。");
          retry = setTimeout(() => void load(), 5000);
        }
      }
    };
    const reconnect = () => void load();
    window.addEventListener("online", reconnect);
    void load();
    return () => {
      active = false;
      clearTimeout(retry);
      window.removeEventListener("online", reconnect);
    };
  }, [account]);
  useEffect(() => {
    setLoaded(false);
    setData({ words: [], events: [], settings: defaultSettings });
    if (account === "guest") {
      const refresh = () => {
        void loadData("guest").then((d) => {
          setData(d);
          setLoaded(true);
        });
      };
      refresh();
      return watchGuest(refresh);
    }
    const sub = liveQuery(() => loadData(account)).subscribe({
      next: (d) => {
        setData(d);
        setLoaded(true);
      },
      error: () => notify("本地存储无法打开，请检查浏览器是否允许保存数据。"),
    });
    return () => sub.unsubscribe();
  }, [account]);
  const record = useCallback(
    async (
      id: string,
      kind: "word" | "sentence",
      correct: boolean,
      assisted = false,
      mode = "flashcard",
      continuation?: { key: string; value: unknown },
    ) => {
      let deviceId = await getMeta<string>(
        account === "guest" ? "guest:device" : "device",
        "",
      );
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        await setMeta(
          account === "guest" ? "guest:device" : "device",
          deviceId,
        );
      }
      const event: LearningEvent = {
        id: crypto.randomUUID(),
        itemId: id,
        kind,
        at: Date.now(),
        result: correct ? "correct" : "wrong",
        assisted,
        mode,
        deviceId,
      };
      await saveEvent(account, event, continuation, data.epoch);
    },
    [account, data.epoch],
  );
  const allWords = [
    ...courseWords.filter((w) => !data.words.some((x) => x.id === w.id)),
    ...data.words,
  ].filter((w) => !w.deleted);
  return (
    <LearningContext.Provider
      value={{
        ...data,
        account,
        setAccount,
        allWords,
        record,
        putWord: (w) => saveWord(account, w, data.epoch),
        putSettings: (s) => saveSettings(account, s, data.epoch),
        notice,
        notify,
        loaded: loaded && authReady && readyAccount === account,
      }}
    >
      {children}
    </LearningContext.Provider>
  );
}
export const useLearning = () => useContext(LearningContext);

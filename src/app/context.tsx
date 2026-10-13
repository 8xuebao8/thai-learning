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
  useEffect(() => {
    setLoaded(false);
    setData({ words: [], events: [], settings: defaultSettings });
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
      let deviceId = await getMeta<string>("device", "");
      if (!deviceId) {
        deviceId = crypto.randomUUID();
        await setMeta("device", deviceId);
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
      await saveEvent(account, event, continuation);
    },
    [account],
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
        putWord: (w) => saveWord(account, w),
        putSettings: (s) => saveSettings(account, s),
        notice,
        notify,
        loaded,
      }}
    >
      {children}
    </LearningContext.Provider>
  );
}
export const useLearning = () => useContext(LearningContext);

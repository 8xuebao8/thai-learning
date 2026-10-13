export function takeBatch<T>(items: T[], count: number, bytes: number): T[] {
  const selected: T[] = [];
  let size = 2;
  for (const item of items) {
    const length = new TextEncoder().encode(JSON.stringify(item)).length + 1;
    if (length + 2 > bytes)
      throw new Error("单条内容超过同步大小限制，请先导出备份，再缩短内容。");
    if (selected.length >= count || size + length > bytes) break;
    selected.push(item);
    size += length;
  }
  return selected;
}

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { createHash } from "node:crypto";
function offline(): Plugin {
  return {
    name: "thai-offline",
    generateBundle(
      _options: unknown,
      bundle: Record<string, { type: string; fileName: string }>,
    ) {
      const files = Object.values(bundle)
        .filter((b) => b.type === "asset" || b.type === "chunk")
        .map((b) => b.fileName);
      const base = process.env.PAGES_BASE || "/";
      const prefix =
        "thai-everyday-" +
        createHash("sha256").update(base).digest("hex").slice(0, 8) +
        "-";
      const version = createHash("sha256")
        .update(files.join("|"))
        .digest("hex")
        .slice(0, 12);
      const precache = [
        base,
        ...files.map((f) => base + f),
        base + "icon.svg",
        base + "manifest.webmanifest",
      ];
      this.emitFile({
        type: "asset",
        fileName: "manifest.webmanifest",
        source: JSON.stringify({
          name: "泰语日常 · Thai Everyday",
          short_name: "泰语日常",
          lang: "zh-CN",
          start_url: base,
          scope: base,
          display: "standalone",
          background_color: "#f8f9f6",
          theme_color: "#315c48",
          icons: [
            {
              src: base + "icon.svg",
              sizes: "any",
              type: "image/svg+xml",
              purpose: "any",
            },
          ],
        }),
      });
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: `const PREFIX='${prefix}';const CACHE=PREFIX+'${version}';const BASE=${JSON.stringify(base)};const FILES=${JSON.stringify(precache)};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==self.location.origin||!u.pathname.startsWith(BASE)||u.search)return;
if(e.request.mode==='navigate'){e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(BASE)).then(r=>r||Response.error())));return;}
if(FILES.some(f=>new URL(f,self.location.origin).pathname===u.pathname))e.respondWith(caches.open(CACHE).then(async c=>(await c.match(e.request,{ignoreVary:true}))||fetch(e.request)));
});`,
      });
    },
  };
}
export default defineConfig({
  plugins: [react(), tailwindcss(), offline()],
  base: process.env.PAGES_BASE || "/",
  build: { sourcemap: false },
});

/**
 * توليد فيديو توضيحي «أين مقعدي؟» — تسجيل شاشة + تعليق صوتي عربي + مونتاج.
 *
 * التشغيل: npm run video:generate
 * المخرجات: assets/videos/ayn-maqadi-tutorial.mp4
 */
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import ffmpegPath from "ffmpeg-static";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const BUILD = path.join(ROOT, "assets", "videos", "build");
const OUT_DIR = path.join(ROOT, "assets", "videos");
const OUT_FILE = path.join(OUT_DIR, "ayn-maqadi-tutorial.mp4");
const PORT = 8765;
const FFMPEG = ffmpegPath || "ffmpeg";
const VOICE = "ar-SA-ZariyahNeural";

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function rimraf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForServer(baseUrl, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await wait(400);
  }
  throw new Error(`الخادم المحلي لم يستجب: ${baseUrl}`);
}

function startServe() {
  return spawn("npx", ["--yes", "serve", "-l", String(PORT), "."], {
    cwd: ROOT,
    shell: true,
    stdio: "ignore",
  });
}

async function synthesizeSpeech(id, text) {
  const outDir = path.join(BUILD, "audio");
  ensureDir(outDir);
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
  const { audioFilePath } = await tts.toFile(outDir, text);
  const dest = path.join(outDir, `${id}.mp3`);
  if (audioFilePath !== dest && fs.existsSync(audioFilePath)) {
    fs.renameSync(audioFilePath, dest);
  }
  return dest;
}

function audioDurationSec(file) {
  try {
    const out = execFileSync(FFMPEG, ["-hide_banner", "-i", file], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "pipe"],
    });
    const m = String(out).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return 5;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  } catch (e) {
    const stderr = e && /** @type {{ stderr?: Buffer }} */ (e).stderr;
    const text = stderr ? stderr.toString("utf8") : "";
    const m = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!m) return 5;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  }
}

/**
 * @param {{ url: string, viewport: { width: number, height: number }, holdMs: number, setup?: (page: import('playwright').Page) => Promise<void>, id: string }} opts
 */
async function recordWebm(opts) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: opts.viewport,
    recordVideo: { dir: BUILD, size: opts.viewport },
    locale: "ar-SA",
    colorScheme: "dark",
  });
  const page = await context.newPage();
  await page.goto(opts.url, { waitUntil: "networkidle", timeout: 60000 });
  if (opts.setup) await opts.setup(page);
  await page.waitForTimeout(opts.holdMs);
  const video = page.video();
  const webmPath = path.join(BUILD, `${opts.id}.webm`);
  await context.close();
  await browser.close();
  if (video) {
    const recorded = await video.path();
    if (recorded && fs.existsSync(recorded)) {
      fs.copyFileSync(recorded, webmPath);
    }
  }
  if (!fs.existsSync(webmPath)) {
    throw new Error(`لم يُحفظ تسجيل الشاشة: ${opts.id}`);
  }
  return webmPath;
}

function mergeScene(webm, mp3, outMp4, durationSec) {
  const dur = Math.max(durationSec + 0.4, 3);
  execFileSync(
    FFMPEG,
    [
      "-y",
      "-i",
      webm,
      "-i",
      mp3,
      "-t",
      String(dur),
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "fast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-movflags",
      "+faststart",
      outMp4,
    ],
    { stdio: "pipe" }
  );
}

function concatSegments(segmentPaths, outPath) {
  const listPath = path.join(BUILD, "concat.txt");
  const lines = segmentPaths
    .map((p) => `file '${p.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`)
    .join("\n");
  fs.writeFileSync(listPath, lines, "utf8");
  execFileSync(
    FFMPEG,
    [
      "-y",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      listPath,
      "-c",
      "copy",
      "-movflags",
      "+faststart",
      outPath,
    ],
    { stdio: "pipe" }
  );
}

async function main() {
  console.log("🎬 توليد فيديو «أين مقعدي؟»…\n");
  rimraf(BUILD);
  ensureDir(BUILD);
  ensureDir(OUT_DIR);

  const serve = startServe();
  const base = `http://127.0.0.1:${PORT}`;
  try {
    await waitForServer(`${base}/video/video-intro.html`);

    const definitions = [
      {
        id: "01-intro",
        text:
          "مرحباً بكم في حفل تخرج ثانوية نخبة الشمال الأهلية. بعد حجز مقعدك، تعرف مكانك بطريقتين: من جوالك عبر واتساب، أو من شاشة أين مقعدي داخل المسرح.",
        minHoldMs: 5500,
        url: `${base}/video/video-intro.html`,
        viewport: { width: 1280, height: 720 },
      },
      {
        id: "02-whatsapp",
        text:
          "بعد الحجز تصلك رسالة واتساب فيها رمز QR ورابط عرض مقعدك. اضغط الرابط من جوالك أو امسح الرمز.",
        minHoldMs: 6500,
        url: `${base}/video/video-whatsapp-mock.html`,
        viewport: { width: 390, height: 844 },
      },
      {
        id: "03-seat-mobile",
        text:
          "تفتح صفحة بانوراما المسرح مع علامة على مقعدك ومسار من المدخل. اضغط تركيز على المقعد للتقريب ومعرفة المكان بدقة.",
        minHoldMs: 14000,
        url: `${base}/video/video-demo-seat.html`,
        viewport: { width: 390, height: 844 },
        async setup(page) {
          await page.waitForSelector("#pano-img", { timeout: 20000 });
          await wait(3500);
          const btn = page.locator("#seat-view-focus");
          if (await btn.isVisible()) {
            await btn.click();
            await wait(2500);
          }
        },
      },
      {
        id: "04-kiosk-home",
        text:
          "داخل المسرح ستجد شاشة أين مقعدي. يمكنك مسح رمز QR من واتساب، أو إدخال رمز الدعوة المكوّن من أربعة أرقام.",
        minHoldMs: 6000,
        url: `${base}/kiosk.html`,
        viewport: { width: 1024, height: 768 },
      },
      {
        id: "05-kiosk-code",
        text:
          "اختر إدخال الرمز، ثم أدخل الأرقام الأربعة من رسالة الدعوة، واضغط عرض مقعدي لرؤية موقعك على الخريطة.",
        minHoldMs: 11000,
        url: `${base}/kiosk.html`,
        viewport: { width: 1024, height: 768 },
        async setup(page) {
          await page.click("#kiosk-go-code");
          await page.waitForTimeout(600);
          for (const d of ["0", "3", "4", "7"]) {
            await page.locator(".kiosk-numpad button", { hasText: d }).click();
            await page.waitForTimeout(450);
          }
          await page.waitForTimeout(1200);
        },
      },
      {
        id: "06-kiosk-result",
        text:
          "تظهر بيانات حجزك: الاسم، المقعد، والمرافق إن وُجد، مع المسار على بانوراما القاعة — مثل صفحة الجوال.",
        minHoldMs: 10000,
        url: `${base}/video/video-demo-seat.html`,
        viewport: { width: 1024, height: 768 },
        async setup(page) {
          await page.waitForSelector("#pano-img", { timeout: 20000 });
          await wait(2000);
        },
      },
      {
        id: "07-outro",
        text:
          "ملخص سريع: من الجوال افتح رابط واتساب. داخل المسرح استخدم شاشة أين مقعدي. نتمنى لكم حفلاً مميزاً.",
        minHoldMs: 5500,
        url: `${base}/video/video-outro.html`,
        viewport: { width: 1280, height: 720 },
      },
    ];

    const segments = [];

    for (let i = 0; i < definitions.length; i++) {
      const def = definitions[i];
      console.log(`[${i + 1}/${definitions.length}] ${def.id} — صوت…`);
      const mp3 = await synthesizeSpeech(def.id, def.text);
      const audioSec = audioDurationSec(mp3);
      const holdMs = Math.max(def.minHoldMs, Math.ceil(audioSec * 1000) + 500);

      console.log(`[${i + 1}/${definitions.length}] ${def.id} — تسجيل شاشة (${holdMs}ms)…`);
      const webm = await recordWebm({
        id: def.id,
        url: def.url,
        viewport: def.viewport,
        holdMs,
        setup: def.setup,
      });

      const segMp4 = path.join(BUILD, `${def.id}.mp4`);
      console.log(`[${i + 1}/${definitions.length}] ${def.id} — دمج…`);
      mergeScene(webm, mp3, segMp4, audioSec);
      segments.push(segMp4);
    }

    console.log("\nدمج المشاهد النهائية…");
    concatSegments(segments, OUT_FILE);
    console.log(`\n✅ تم: ${OUT_FILE}`);
  } finally {
    serve.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error("\n❌ فشل التوليد:", err);
  process.exit(1);
});

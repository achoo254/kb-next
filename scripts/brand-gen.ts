/**
 * `pnpm brand:gen`: everything the platforms show of the brand, derived from the vector app icon
 * (brand/app-icon.svg, the KnowFlow mark of the approved Universe mock) and brand.config.json, with the Chromium of
 * @playwright/test:
 *
 * - brand/generated/: web manifest, PNG icons (192, 512, maskable, Apple touch) and favicon.ico (writeBrandFiles);
 * - apps/web/public/brand-mark-96.webp: the mark as a small raster;
 * - apps/web/public/og-image.png: the 1200 × 630 link preview: the Universe landscape (bg-universe-dark), the icon
 *   beside the name and the description, in the app's own fonts and the dark theme's colours of
 *   apps/web/src/ui/tokens.css.
 *
 * Run after changing the icon, the tokens or the brand, then commit the files.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { chromiumRenderer, writeBrandFiles } from '@achoo254/brand/build';
import { primaryOrigin } from '@achoo254/brand/hosts';
import { type Page, chromium } from '@playwright/test';
import { BRAND_GENERATED_DIR, BRAND_ROOT, MANIFEST_OPTIONS, OG_IMAGE, loadKbBrand } from '../apps/web/vite-brand';
import { parseTokens } from './token-contrast';

const TOKENS = new URL('apps/web/src/ui/tokens.css', BRAND_ROOT);
const PUBLIC_DIR = new URL('apps/web/public/', BRAND_ROOT);
const BACKGROUND = new URL('apps/web/public/art/bg-universe-dark.webp', BRAND_ROOT);

const webRequire = createRequire(new URL('apps/web/package.json', BRAND_ROOT));

/** A @fontsource weight stylesheet with its WOFF2 files inlined (WOFF fallbacks dropped), so the page renders offline. */
function inlinedFontCss(stylesheet: string): string {
  const file = webRequire.resolve(stylesheet);
  return readFileSync(file, 'utf8').replace(/url\(\.\/files\/([^)]+\.woff2)\) format\('woff2'\)(, url\([^)]+\) format\('woff'\))?/g, (_match, name: string) => {
    const bytes = readFileSync(new URL(`files/${name}`, pathToFileURL(file)));
    return `url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2')`;
  });
}

const dataUrl = (bytes: Buffer, type: string): string => `data:${type};base64,${bytes.toString('base64')}`;

function dataUrlBytes(value: string, type: string): Buffer {
  const prefix = `data:${type};base64,`;
  if (!value.startsWith(prefix)) throw new Error(`brand:gen: Chromium did not encode ${type}`);
  return Buffer.from(value.slice(prefix.length), 'base64');
}

/** The icon drawn at `size` px and encoded by the browser, as a data URL. */
async function rasterIcon(page: Page, iconSrc: string, size: number, type: 'image/webp' | 'image/png'): Promise<string> {
  return page.evaluate(
    async ({ src, size, type }) => {
      const image = new Image(size, size);
      image.src = src;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('no 2d context');
      context.drawImage(image, 0, 0, size, size);
      return canvas.toDataURL(type, 0.92);
    },
    { src: iconSrc, size, type },
  );
}

interface OgColours {
  bg: string;
  ink: string;
  muted: string;
}

function ogColours(): OgColours {
  const tokens = parseTokens(readFileSync(TOKENS, 'utf8'));
  const v = (name: string): string => {
    const found = tokens.get(name);
    if (found === undefined) throw new Error(`brand:gen: tokens.css does not define ${name}`);
    return found;
  };
  return { bg: v('--dark-bg'), ink: v('--dark-text'), muted: v('--dark-muted') };
}

function ogHtml(iconSrc: string, backgroundSrc: string, appName: string, description: string, host: string, c: OgColours): string {
  return `<!doctype html><html lang="vi"><head><style>
${inlinedFontCss('@fontsource/inter/500.css')}
${inlinedFontCss('@fontsource/space-grotesk/700.css')}
</style></head><body style="margin:0">
<div style="position:relative;width:${OG_IMAGE.width}px;height:${OG_IMAGE.height}px;overflow:hidden;color:${c.ink};font-family:'Inter',sans-serif;background:${c.bg}">
<img src="${backgroundSrc}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:.75">
<div style="position:absolute;top:0;bottom:0;left:88px;right:88px;display:flex;align-items:center;gap:64px">
<img src="${iconSrc}" width="260" height="260" alt="" style="flex:none;border-radius:60px">
<div style="display:flex;flex-direction:column;align-items:flex-start;gap:26px">
<div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:112px;line-height:.95">${appName}</div>
<div style="font-size:34px;line-height:1.3;max-width:680px">${description}</div>
<div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:26px;color:${c.muted}">${host}</div>
</div></div></div></body></html>`;
}

async function main(): Promise<void> {
  const brand = loadKbBrand();
  const iconSrc = dataUrl(readFileSync(new URL(brand.icon, BRAND_ROOT)), 'image/svg+xml');
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    writeFileSync(new URL('brand-mark-96.webp', PUBLIC_DIR), dataUrlBytes(await rasterIcon(page, iconSrc, 96, 'image/webp'), 'image/webp'));

    await page.setViewportSize({ width: OG_IMAGE.width, height: OG_IMAGE.height });
    const host = new URL(primaryOrigin(brand)).host;
    await page.setContent(ogHtml(iconSrc, dataUrl(readFileSync(BACKGROUND), 'image/webp'), brand.appName, brand.description, host, ogColours()));
    await page.locator('img').evaluateAll((images: HTMLImageElement[]) => Promise.all(images.map((img) => img.decode())));
    await page.evaluate(() => document.fonts.ready);
    writeFileSync(new URL(OG_IMAGE.path, PUBLIC_DIR), await page.screenshot({ clip: { x: 0, y: 0, width: OG_IMAGE.width, height: OG_IMAGE.height } }));
  } finally {
    await browser.close();
  }
  const written = await writeBrandFiles({
    brand,
    root: BRAND_ROOT,
    generatedDir: BRAND_GENERATED_DIR,
    manifests: MANIFEST_OPTIONS,
    indent: 2,
    renderer: chromiumRenderer(chromium),
  });
  console.log(`Wrote the brand mark, og-image and ${written.length} files to brand/generated/: ${written.join(', ')}`);
}

main().catch((error: unknown) => {
  console.error('brand:gen failed:', error);
  process.exitCode = 1;
});

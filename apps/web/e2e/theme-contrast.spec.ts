import { expect, test } from "@playwright/test";

type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const samples = [
  {
    name: "primary button",
    selector: "[data-theme-sample='primary']",
    html: `<button data-theme-sample="primary" class="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground">Primary</button>`
  },
  {
    name: "danger button",
    selector: "[data-theme-sample='danger']",
    html: `<button data-theme-sample="danger" class="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-danger bg-danger px-3 py-2 text-sm font-medium text-background">Danger</button>`
  },
  {
    name: "secondary button",
    selector: "[data-theme-sample='secondary']",
    html: `<button data-theme-sample="secondary" class="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm font-medium text-foreground">Secondary</button>`
  },
  {
    name: "ghost button",
    selector: "[data-theme-sample='ghost']",
    html: `<button data-theme-sample="ghost" class="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-transparent bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground">Ghost</button>`
  },
  {
    name: "success badge",
    selector: "[data-theme-sample='success-badge']",
    html: `<span data-theme-sample="success-badge" class="inline-flex items-center rounded-md border border-success/30 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Success</span>`
  },
  {
    name: "danger badge",
    selector: "[data-theme-sample='danger-badge']",
    html: `<span data-theme-sample="danger-badge" class="inline-flex items-center rounded-md border border-danger/30 bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">Danger</span>`
  },
  {
    name: "active tab",
    selector: "[data-theme-sample='active-tab']",
    html: `<button data-theme-sample="active-tab" class="min-h-8 rounded bg-primary px-3 text-sm text-primary-foreground">Active</button>`
  },
  {
    name: "inactive tab",
    selector: "[data-theme-sample='inactive-tab']",
    html: `<button data-theme-sample="inactive-tab" class="min-h-8 rounded bg-transparent px-3 text-sm text-muted-foreground">Inactive</button>`
  }
] as const;

test("dark theme component variants keep their computed colors and contrast", async ({ page }) => {
  await page.goto("/login");

  await page.locator("body").evaluate(
    (body, sampleHtml) => {
      const fixture = document.createElement("main");
      fixture.setAttribute("aria-label", "Theme contrast fixture");
      fixture.style.display = "grid";
      fixture.style.gap = "12px";
      fixture.style.padding = "24px";
      fixture.innerHTML = sampleHtml.join("");
      body.replaceChildren(fixture);
    },
    samples.map((sample) => sample.html)
  );

  const bodyBackground = parseColor(
    await page.locator("body").evaluate((element) => getComputedStyle(element).backgroundColor)
  );
  const primary = parseColor(
    await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).getPropertyValue("--primary"))
  );
  const danger = parseColor(
    await page
      .locator("html")
      .evaluate((element) => getComputedStyle(element).getPropertyValue("--danger"))
  );

  const computed = await Promise.all(
    samples.map(async (sample) => {
      const styles = await page.locator(sample.selector).evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color
        };
      });

      const foreground = parseColor(styles.color);
      const background = composite(parseColor(styles.backgroundColor), bodyBackground);
      return {
        name: sample.name,
        background,
        contrast: contrastRatio(foreground, background)
      };
    })
  );

  for (const result of computed) {
    expect(result.contrast, `${result.name} contrast`).toBeGreaterThanOrEqual(4.5);
  }

  expect(colorsAlmostEqual(findComputed("primary button", computed).background, primary)).toBe(
    true
  );
  expect(colorsAlmostEqual(findComputed("active tab", computed).background, primary)).toBe(true);
  expect(colorsAlmostEqual(findComputed("danger button", computed).background, danger)).toBe(true);
  expect(colorsAlmostEqual(findComputed("ghost button", computed).background, bodyBackground)).toBe(
    true
  );
  expect(colorsAlmostEqual(findComputed("inactive tab", computed).background, bodyBackground)).toBe(
    true
  );
});

function findComputed(name: string, computed: Array<{ name: string; background: Rgba }>) {
  const result = computed.find((sample) => sample.name === name);
  if (!result) throw new Error(`Missing computed sample: ${name}`);
  return result;
}

function parseColor(value: string): Rgba {
  const trimmed = value.trim();
  if (trimmed.startsWith("#")) {
    return parseHexColor(trimmed);
  }

  const rgb = trimmed.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return {
      r: parts[0],
      g: parts[1],
      b: parts[2],
      a: parts[3] ?? 1
    };
  }

  const srgb = trimmed.match(
    /^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*[/]\s*([\d.]+))?\)$/
  );
  if (srgb) {
    return {
      r: Number(srgb[1]) * 255,
      g: Number(srgb[2]) * 255,
      b: Number(srgb[3]) * 255,
      a: srgb[4] ? Number(srgb[4]) : 1
    };
  }

  const hsl = trimmed.match(/^([\d.]+)\s+([\d.]+)%\s+([\d.]+)%$/);
  if (hsl) {
    return hslToRgb(Number(hsl[1]), Number(hsl[2]), Number(hsl[3]));
  }

  const oklab = trimmed.match(
    /^oklab\(([-\d.]+%?)\s+([-\d.]+%?)\s+([-\d.]+%?)(?:\s*[/]\s*([\d.]+))?\)$/
  );
  if (oklab) {
    return oklabToRgb(
      parseOklabChannel(oklab[1], 1),
      parseOklabChannel(oklab[2], 0.4),
      parseOklabChannel(oklab[3], 0.4),
      oklab[4] ? Number(oklab[4]) : 1
    );
  }

  throw new Error(`Unsupported color format: ${value}`);
}

function parseHexColor(value: string): Rgba {
  const hex = value.slice(1);
  const channels =
    hex.length === 3
      ? hex.split("").map((character) => Number.parseInt(`${character}${character}`, 16))
      : [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)].map((channel) =>
          Number.parseInt(channel, 16)
        );

  return {
    r: channels[0],
    g: channels[1],
    b: channels[2],
    a: 1
  };
}

function composite(foreground: Rgba, background: Rgba): Rgba {
  return {
    r: foreground.r * foreground.a + background.r * (1 - foreground.a),
    g: foreground.g * foreground.a + background.g * (1 - foreground.a),
    b: foreground.b * foreground.a + background.b * (1 - foreground.a),
    a: 1
  };
}

function hslToRgb(hue: number, saturationPercent: number, lightnessPercent: number): Rgba {
  const saturation = saturationPercent / 100;
  const lightness = lightnessPercent / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const [red, green, blue] =
    huePrime >= 0 && huePrime < 1
      ? [chroma, x, 0]
      : huePrime >= 1 && huePrime < 2
        ? [x, chroma, 0]
        : huePrime >= 2 && huePrime < 3
          ? [0, chroma, x]
          : huePrime >= 3 && huePrime < 4
            ? [0, x, chroma]
            : huePrime >= 4 && huePrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x];
  const match = lightness - chroma / 2;

  return {
    r: (red + match) * 255,
    g: (green + match) * 255,
    b: (blue + match) * 255,
    a: 1
  };
}

function parseOklabChannel(value: string, percentageScale: number) {
  return value.endsWith("%") ? (Number(value.slice(0, -1)) / 100) * percentageScale : Number(value);
}

function oklabToRgb(lightness: number, a: number, b: number, alpha: number): Rgba {
  const long = Math.pow(lightness + 0.3963377774 * a + 0.2158037573 * b, 3);
  const medium = Math.pow(lightness - 0.1055613458 * a - 0.0638541728 * b, 3);
  const short = Math.pow(lightness - 0.0894841775 * a - 1.291485548 * b, 3);

  return {
    r: linearRgbToSrgb(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short),
    g: linearRgbToSrgb(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short),
    b: linearRgbToSrgb(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short),
    a: alpha
  };
}

function linearRgbToSrgb(value: number) {
  const clamped = Math.min(1, Math.max(0, value));
  return (
    (clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055) * 255
  );
}

function contrastRatio(foreground: Rgba, background: Rgba) {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance({ r, g, b }: Rgba) {
  const [red, green, blue] = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  });

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function colorsAlmostEqual(left: Rgba, right: Rgba) {
  return (
    Math.abs(left.r - right.r) <= 1 &&
    Math.abs(left.g - right.g) <= 1 &&
    Math.abs(left.b - right.b) <= 1
  );
}

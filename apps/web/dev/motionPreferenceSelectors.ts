import type { AtRule, Node, Plugin, Rule } from "postcss";

type MotionPreferenceSelectorsParams = {
  attribute: string;
  reducedValue: string;
  fullValue: string;
};

type ScopeSelectorParams = {
  selector: string;
  condition: string;
};

const MOTION_FEATURE = /^\(\s*prefers-reduced-motion\s*:\s*(reduce|no-preference)\s*\)$/i;
const ROOT_SELECTOR = /^(:root|html)(?![\w-])/i;

function scopeSelector({ selector, condition }: ScopeSelectorParams): string {
  const trimmed = selector.trim();
  const root = ROOT_SELECTOR.exec(trimmed);
  if (root) {
    return `${root[1]}:where(${condition})${trimmed.slice(root[1]!.length)}`;
  }
  return `:where(:root${condition}) ${trimmed}`;
}

function isNestedBelowMedia(rule: Rule, media: AtRule): boolean {
  let parent: Node | undefined = rule.parent;
  while (parent && parent !== media) {
    if (parent.type === "rule") {
      return true;
    }
    if (parent.type === "atrule" && /keyframes$/i.test((parent as AtRule).name)) {
      return true;
    }
    parent = parent.parent;
  }
  return false;
}

export function motionPreferenceSelectors({
  attribute,
  reducedValue,
  fullValue,
}: MotionPreferenceSelectorsParams): Plugin {
  function rewrite(media: AtRule) {
    if (media.parent?.type === "rule") {
      throw media.error("Move this motion-preference media query to the top level of the stylesheet.");
    }
    if (media.params.includes(",") || /^\s*(not|only)\s/i.test(media.params)) {
      throw media.error("Split this media query: a motion-preference query cannot use commas, not, or only.");
    }
    const features = media.params.split(/\s+and\s+/i).map((feature) => feature.trim());
    const remaining = features.filter((feature) => !MOTION_FEATURE.test(feature));
    const motion = features.map((feature) => MOTION_FEATURE.exec(feature)?.[1]).find(Boolean);
    if (!motion) {
      throw media.error(
        "Write the motion feature as (prefers-reduced-motion: reduce) or (prefers-reduced-motion: no-preference).",
      );
    }
    const value = motion.toLowerCase() === "reduce" ? reducedValue : fullValue;
    const condition = `[${attribute}="${value}"]`;
    media.walkRules((rule) => {
      if (isNestedBelowMedia(rule, media)) {
        return;
      }
      rule.selectors = rule.selectors.map((selector) => scopeSelector({ selector, condition }));
    });
    if (remaining.length > 0) {
      media.params = remaining.join(" and ");
      return;
    }
    media.replaceWith(media.nodes ?? []);
  }

  return {
    postcssPlugin: "aegis-motion-preference-selectors",
    Once(root) {
      const motionQueries: AtRule[] = [];
      root.walkAtRules("media", (media) => {
        if (/prefers-reduced-motion/i.test(media.params)) {
          motionQueries.push(media);
        }
      });
      for (const media of motionQueries) {
        rewrite(media);
      }
    },
  };
}

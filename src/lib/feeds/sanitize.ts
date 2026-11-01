import parseSrcsetSpec from "parse-srcset";
import sanitizeHtml from "sanitize-html";

const EMBED_HOSTS = ["www.youtube.com", "www.youtube-nocookie.com", "player.vimeo.com"];

/**
 * Candidatos de um srcset, com o mesmo parser (parse-srcset, segue a especificação) que o
 * sanitize-html usa depois para validar: URLs podem conter vírgulas (data:, Cloudinary).
 */
export function parseSrcset(value: string): { url: string; descriptor: string }[] {
  return parseSrcsetSpec(value).map((c) => ({
    url: c.url,
    descriptor: c.w !== undefined ? `${c.w}w` : c.d !== undefined ? `${c.d}x` : c.h !== undefined ? `${c.h}h` : "",
  }));
}

export function sanitizeArticleHtml(html: string, baseUrl?: string | null): string {
  const absolute = (value: string) => {
    if (!baseUrl || !value) return value;
    try {
      return new URL(value, baseUrl).toString();
    } catch {
      return value;
    }
  };
  // srcset: "url 1x, url 2x" / "url 480w"; cada URL relativa vira absoluta (senão a imagem quebra no leitor).
  const absoluteSrcset = (value: string | undefined) => value && parseSrcset(value).map(({ url, descriptor }) => [absolute(url), descriptor].filter(Boolean).join(" ")).join(", ");
  const withAbsolute = (attribs: Record<string, string>, names: string[]) => {
    const out = { ...attribs };
    for (const name of names) if (out[name]) out[name] = absolute(out[name]);
    if (out.srcset) out.srcset = absoluteSrcset(out.srcset)!;
    return out;
  };

  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "img", "figure", "figcaption", "picture", "source", "video", "audio", "iframe", "del", "ins", "sup", "sub", "details", "summary",
    ],
    allowedAttributes: {
      a: ["href", "title", "target", "rel"],
      // loading/referrerpolicy são adicionados pelo transformTags; sem estar aqui, o filtro de atributos os removeria.
      img: ["src", "srcset", "alt", "title", "width", "height", "loading", "referrerpolicy"],
      source: ["src", "srcset", "type", "media"],
      video: ["src", "poster", "controls", "width", "height", "preload"],
      audio: ["src", "controls", "preload"],
      // sandbox/allow/loading vêm do transformTags (só players de vídeo conhecidos passam).
      iframe: ["src", "width", "height", "allowfullscreen", "frameborder", "sandbox", "allow", "loading", "referrerpolicy"],
      th: ["colspan", "rowspan"],
      td: ["colspan", "rowspan"],
      "*": ["lang", "dir"],
    },
    allowedSchemes: ["http", "https", "mailto", "data"],
    allowedSchemesByTag: { img: ["http", "https", "data"], a: ["http", "https", "mailto"] },
    allowedIframeHostnames: EMBED_HOSTS,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, href: absolute(attribs.href ?? ""), target: "_blank", rel: "noopener noreferrer nofollow" },
      }),
      img: (tagName, attribs) => ({
        tagName,
        attribs: { ...withAbsolute(attribs, ["src"]), loading: "lazy", referrerpolicy: "no-referrer" },
      }),
      source: (tagName, attribs) => ({ tagName, attribs: withAbsolute(attribs, ["src"]) }),
      video: (tagName, attribs) => ({ tagName, attribs: { ...withAbsolute(attribs, ["src", "poster"]), preload: "none" } }),
      audio: (tagName, attribs) => ({ tagName, attribs: { ...withAbsolute(attribs, ["src"]), preload: "none" } }),
      iframe: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          sandbox: "allow-scripts allow-same-origin allow-presentation allow-popups",
          allow: "fullscreen; encrypted-media; picture-in-picture",
          loading: "lazy",
          referrerpolicy: "strict-origin-when-cross-origin",
        },
      }),
    },
    exclusiveFilter: (frame) => frame.tag === "img" && (!frame.attribs.src || /(^|\/)(pixel|spacer|tracking)\b/i.test(frame.attribs.src)),
  });
}

/** Primeira imagem do HTML (para miniaturas na lista). */
export function firstImage(html: string | null | undefined): string | null {
  if (!html) return null;
  return /<img[^>]+src=["']([^"']+)["']/i.exec(html)?.[1] ?? null;
}

declare module "parse-srcset" {
  /** Candidatos de um atributo srcset (https://html.spec.whatwg.org/#parse-a-srcset-attribute). */
  export default function parseSrcset(input: string): { url: string; w?: number; h?: number; d?: number }[];
}

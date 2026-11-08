"use client";

import { useLayoutEffect, useRef, useState } from "react";

export type IndicatorBox = { left: number; top: number; width: number; height: number; hidden: boolean };

const same = (a: IndicatorBox, b: IndicatorBox) =>
  a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height && a.hidden === b.hidden;

/**
 * Fundo/sublinhado único que desliza até o item ativo (menu lateral, abas, sub-abas).
 *
 * Ligue `ref` no próprio indicador (um filho `absolute` do contêiner, que precisa ser `relative`):
 * o contêiner é o pai do indicador. Assim funciona mesmo quando o indicador é renderizado por um
 * componente filho, cuja ref do pai ainda não existe quando o efeito roda na primeira montagem.
 *
 * Mede de novo quando `deps` muda, quando o contêiner ou um filho muda de tamanho e quando itens
 * entram ou saem (ex.: o campo de nova pasta empurra o item ativo para baixo sem mudar tamanhos).
 * A primeira medida não anima: o indicador aparece já no lugar.
 */
export function useActiveIndicator<T extends HTMLElement = HTMLSpanElement>(selector: string, deps: unknown) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<IndicatorBox | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const container = ref.current?.parentElement;
    if (!container) return;

    const measure = () => {
      const active = container.querySelector<HTMLElement>(selector);
      if (!active) return setBox(null);
      const c = container.getBoundingClientRect();
      const r = active.getBoundingClientRect();
      const next: IndicatorBox = {
        left: r.left - c.left + container.scrollLeft,
        top: r.top - c.top + container.scrollTop,
        width: r.width,
        height: r.height,
        // Item dentro de algo recolhido (inert): o indicador some em vez de ficar no lugar errado.
        hidden: Boolean(active.closest("[inert]")),
      };
      // Mesmo lugar: não re-renderiza (o MutationObserver dispara a cada contador que muda).
      setBox((prev) => (prev && same(prev, next) ? prev : next));
    };

    const resize = new ResizeObserver(measure);
    const observeChildren = () => {
      resize.disconnect();
      resize.observe(container);
      for (const child of container.children) resize.observe(child);
    };
    const mutations = new MutationObserver(() => {
      observeChildren();
      measure();
    });

    measure();
    observeChildren();
    mutations.observe(container, { childList: true, subtree: true });
    const frame = requestAnimationFrame(() => setAnimate(true));
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
    };
  }, [selector, deps]);

  return { ref, box, animate };
}

/**
 * Traz o item para a vista rolando só o contêiner na horizontal (abas que não cabem na largura).
 * Ao contrário de scrollIntoView, nunca rola a página na vertical.
 */
export function revealInline(container: HTMLElement | null, item: HTMLElement | null) {
  if (!container || !item) return;
  const left = item.offsetLeft;
  const right = left + item.offsetWidth;
  if (left < container.scrollLeft) container.scrollTo({ left, behavior: "smooth" });
  else if (right > container.scrollLeft + container.clientWidth) container.scrollTo({ left: right - container.clientWidth, behavior: "smooth" });
}

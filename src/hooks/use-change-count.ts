import { useState } from "react";

/**
 * Conta quantas vezes `value` mudou desde a montagem (0 no primeiro render).
 * Use como `key` de um elemento com animação de entrada: ela roda a cada mudança,
 * mas não quando a página carrega. `when` filtra as mudanças que contam (ex.: só ao salvar).
 */
export function useChangeCount<T>(value: T, when: (next: T) => boolean = () => true) {
  const [previous, setPrevious] = useState(value);
  const [count, setCount] = useState(0);
  if (!Object.is(previous, value)) {
    setPrevious(value);
    if (when(value)) setCount((n) => n + 1);
  }
  return count;
}

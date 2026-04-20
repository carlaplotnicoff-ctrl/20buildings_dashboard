import { signal } from '@preact/signals';

export const toasts = signal([]);

let toastId = 0;

export function addToast(message, type = 'ok') {
  const id = ++toastId;
  toasts.value = [...toasts.value, { id, message, type }];
  setTimeout(() => {
    toasts.value = toasts.value.filter(t => t.id !== id);
  }, 4000);
}

export function Toasts() {
  return (
    <div class="toasts">
      {toasts.value.map(t => (
        <div key={t.id} class={`toast ${t.type}`}>{t.message}</div>
      ))}
    </div>
  );
}

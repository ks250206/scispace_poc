export const getWindowTitle = (title: string): HTMLElement | undefined =>
  Array.from(document.querySelectorAll<HTMLElement>(".window-titlebar strong")).find(
    (element) => element.textContent === title,
  );

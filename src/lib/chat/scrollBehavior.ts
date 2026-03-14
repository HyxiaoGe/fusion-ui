export function isNearBottom(element: HTMLElement, threshold = 120): boolean {
  const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight;
  return distanceToBottom <= threshold;
}

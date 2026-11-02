const CLOSE_SEARCH_EVENT = 'earth-talk:close-map-search';
const CLOSE_FILTER_EVENT = 'earth-talk:close-map-filter';

export function closeMapSearch() {
  window.dispatchEvent(new Event(CLOSE_SEARCH_EVENT));
}

export function closeMapFilter() {
  window.dispatchEvent(new Event(CLOSE_FILTER_EVENT));
}

export function onCloseMapSearch(handler: () => void) {
  window.addEventListener(CLOSE_SEARCH_EVENT, handler);
  return () => window.removeEventListener(CLOSE_SEARCH_EVENT, handler);
}

export function onCloseMapFilter(handler: () => void) {
  window.addEventListener(CLOSE_FILTER_EVENT, handler);
  return () => window.removeEventListener(CLOSE_FILTER_EVENT, handler);
}

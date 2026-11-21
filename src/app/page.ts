export type Page =
  | 'today'
  | 'focus'
  | 'review-focus'
  | 'problems'
  | 'journal'
  | 'study'
  | 'settings'

export function isFocusPage(page: Page): boolean {
  return page === 'focus' || page === 'review-focus'
}

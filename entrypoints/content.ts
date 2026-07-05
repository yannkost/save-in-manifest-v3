interface ContextDetailsMessage {
  type: 'save-in-context-details';
  linkText?: string;
  linkUrl?: string;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    document.addEventListener(
      'contextmenu',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const anchor = target.closest('a');
        const linkUrl = anchor instanceof HTMLAnchorElement ? anchor.href || undefined : undefined;
        const linkText = anchor ? extractLinkText(anchor) : undefined;

        const message: ContextDetailsMessage = {
          type: 'save-in-context-details',
          linkText,
          linkUrl,
        };

        void browser.runtime.sendMessage(message).catch(() => {
          // Ignore pages where messaging is temporarily unavailable.
        });
      },
      true,
    );
  },
});

function extractLinkText(anchor: Element): string | undefined {
  const candidates = [
    anchor.getAttribute('aria-label'),
    anchor.getAttribute('title'),
    'innerText' in anchor ? String(anchor.innerText || '') : '',
    anchor.textContent || '',
  ]
    .map((value) => value?.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  if (candidates.length > 0) {
    return candidates[0];
  }

  const image = anchor.querySelector('img');
  const alt = image?.getAttribute('alt')?.replace(/\s+/g, ' ').trim();
  return alt || undefined;
}

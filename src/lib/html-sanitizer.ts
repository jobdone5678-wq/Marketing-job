import sanitizeHtml from 'sanitize-html';

const ALLOWED_TAGS = [
  'p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i',
  'h1', 'h2', 'h3', 'h4', 'span', 'blockquote', 'code', 'pre'
];

export function sanitizeJobHtml(dirty: string | null | undefined): string {
  if (!dirty || typeof dirty !== 'string') return '';
  return sanitizeHtml(dirty, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
}

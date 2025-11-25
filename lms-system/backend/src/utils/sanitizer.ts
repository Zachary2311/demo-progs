import DOMPurify from 'isomorphic-dompurify';

/**
 * Sanitize HTML content to prevent XSS attacks
 * Whitelist common HTML tags used in lesson content
 */
export const sanitizeContent = (content: string): string => {
  if (!content) return '';

  const config = {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a', 'img', 'video', 'iframe',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'hr', 'div', 'span'
    ],
    ALLOWED_ATTR: {
      'a': ['href', 'title', 'target', 'rel'],
      'img': ['src', 'alt', 'width', 'height', 'title'],
      'video': ['src', 'width', 'height', 'controls', 'autoplay', 'loop'],
      'iframe': ['src', 'width', 'height', 'allow', 'allowfullscreen'],
      'div': ['class', 'id'],
      'span': ['class', 'id'],
      'code': ['class'],
      'pre': ['class'],
      'table': ['border', 'cellpadding', 'cellspacing', 'width'],
    },
    KEEP_CONTENT: true,
    RETURN_DOM_FRAGMENT: false,
    RETURN_DOM: false,
  };

  return DOMPurify.sanitize(content, config);
};

/**
 * Sanitize user input for plain text fields (removes all HTML)
 */
export const sanitizeText = (text: string): string => {
  if (!text) return '';
  // Remove all HTML tags
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [] });
};

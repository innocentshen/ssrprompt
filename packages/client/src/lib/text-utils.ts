/**
 * Text utilities for smart text matching and replacement
 */

/**
 * Remove common Markdown formatting for comparison
 */
export function stripMarkdown(text: string): string {
  return text
    // Remove bold/italic: **text**, *text*, __text__, _text_
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    // Remove strikethrough: ~~text~~
    .replace(/~~(.*?)~~/g, '$1')
    // Remove inline code: `code`
    .replace(/`([^`]+)`/g, '$1')
    // Remove links: [text](url)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images: ![alt](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove headers: # ## ### etc
    .replace(/^#{1,6}\s+/gm, '')
    // Remove blockquotes: > text
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize text for comparison (strip markdown and normalize whitespace)
 */
export function normalizeForComparison(text: string): string {
  return stripMarkdown(text).toLowerCase();
}

/**
 * Find the best matching segment in content for the given search text
 * Returns the original segment (with markdown) if found
 */
export function findMatchingSegment(
  content: string,
  searchText: string
): { start: number; end: number; matched: string } | null {
  // First try exact match
  const exactIndex = content.indexOf(searchText);
  if (exactIndex !== -1) {
    return {
      start: exactIndex,
      end: exactIndex + searchText.length,
      matched: searchText,
    };
  }

  // Normalize the search text
  const normalizedSearch = normalizeForComparison(searchText);
  if (!normalizedSearch) return null;

  // Try to find a matching segment by sliding window
  // We'll look for segments that, when normalized, match the search text
  const words = normalizedSearch.split(' ').filter(w => w.length > 0);
  if (words.length === 0) return null;

  // Find potential starting positions by looking for the first word
  const firstWord = words[0];

  let searchStart = 0;
  while (searchStart < content.length) {
    // Find next occurrence of first word (ignoring markdown)
    const strippedFromStart = stripMarkdown(content.slice(searchStart)).toLowerCase();
    const wordIndex = strippedFromStart.indexOf(firstWord);

    if (wordIndex === -1) break;

    // Map the position back to original content
    // This is tricky - we need to find where this word is in the original
    let originalPos = searchStart;
    let strippedPos = 0;

    // Walk through content to find the actual position
    while (originalPos < content.length && strippedPos < wordIndex) {
      const char = content[originalPos];
      const nextTwo = content.slice(originalPos, originalPos + 2);

      // Skip markdown syntax
      if (nextTwo === '**' || nextTwo === '__' || nextTwo === '~~') {
        originalPos += 2;
        continue;
      }
      if (char === '*' || char === '_' || char === '`') {
        originalPos += 1;
        continue;
      }

      // Count this character
      if (!/\s/.test(char) || strippedPos === 0 || strippedFromStart[strippedPos - 1] !== ' ') {
        strippedPos++;
      }
      originalPos++;
    }

    // Now try to find the end of the matching segment
    let endPos = originalPos;
    let matchedWords = 0;
    let currentWord = '';

    while (endPos < content.length && matchedWords < words.length) {
      const char = content[endPos];
      const nextTwo = content.slice(endPos, endPos + 2);

      // Skip markdown syntax
      if (nextTwo === '**' || nextTwo === '__' || nextTwo === '~~') {
        endPos += 2;
        continue;
      }
      if (char === '*' || char === '_' || char === '`') {
        endPos += 1;
        continue;
      }

      if (/\s/.test(char)) {
        if (currentWord && currentWord.toLowerCase() === words[matchedWords]) {
          matchedWords++;
        } else if (currentWord) {
          // Word doesn't match, this isn't the right segment
          break;
        }
        currentWord = '';
      } else {
        currentWord += char;
      }
      endPos++;
    }

    // Check final word
    if (currentWord && matchedWords < words.length) {
      if (currentWord.toLowerCase() === words[matchedWords]) {
        matchedWords++;
      }
    }

    // If we matched all words, we found the segment
    if (matchedWords === words.length) {
      return {
        start: originalPos,
        end: endPos,
        matched: content.slice(originalPos, endPos),
      };
    }

    // Move to next potential match
    searchStart = originalPos + 1;
  }

  return null;
}

/**
 * Smart replace: find originalText in content (ignoring markdown) and replace with newText
 */
export function smartReplace(
  content: string,
  originalText: string,
  newText: string
): { replaced: boolean; content: string } {
  // First try exact replacement
  if (content.includes(originalText)) {
    return {
      replaced: true,
      content: content.replace(originalText, newText),
    };
  }

  // Try smart matching
  const match = findMatchingSegment(content, originalText);
  if (match) {
    const newContent =
      content.slice(0, match.start) +
      newText +
      content.slice(match.end);
    return {
      replaced: true,
      content: newContent,
    };
  }

  return {
    replaced: false,
    content,
  };
}

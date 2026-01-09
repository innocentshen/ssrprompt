import { isImageFile as checkIsImage, isPdfFile as checkIsPdf, isTextFile as checkIsText } from './file-utils';
import { filesApi } from '../api/files';

export interface FileAttachment {
  fileId: string;
  name: string;
  type: string;
  size?: number;
}

// 思考内容提取结果
export interface ThinkingContent {
  thinking: string;
  content: string;
}

// 思考内容检测正则模式
const THINKING_PATTERNS = [
  /<thinking>([\s\S]*?)<\/thinking>/gi,
  /<think>([\s\S]*?)<\/think>/gi,
  /<thought>([\s\S]*?)<\/thought>/gi,
  /<reasoning>([\s\S]*?)<\/reasoning>/gi,
  /\[THINKING\]([\s\S]*?)\[\/THINKING\]/gi,
  /◁think▷([\s\S]*?)◁\/think▷/gi,
  /<seed:think>([\s\S]*?)<\/seed:think>/gi,
  /###\s*Thinking\s*\n([\s\S]*?)(?=###\s*Response|$)/gi,
];

/**
 * 从响应内容中提取思考内容
 */
export function extractThinking(response: string): ThinkingContent {
  let thinking = '';
  let content = response;

  for (const pattern of THINKING_PATTERNS) {
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;

    const matches = response.matchAll(new RegExp(pattern.source, pattern.flags));
    for (const match of matches) {
      if (match[1]) {
        thinking += (thinking ? '\n\n' : '') + match[1].trim();
      }
    }

    // Remove thinking blocks from content
    content = content.replace(pattern, '');
  }

  // Clean up ###Response header if it exists (from ###Thinking format)
  content = content.replace(/^###\s*Response\s*\n?/gim, '');

  return {
    thinking: thinking.trim(),
    content: content.trim(),
  };
}

/**
 * 上传文件到文件服务，返回 fileId 引用
 */
export async function uploadFileAttachment(file: File): Promise<FileAttachment> {
  const uploaded = await filesApi.upload(file);
  return {
    fileId: uploaded.id,
    name: uploaded.name,
    type: uploaded.type,
    size: uploaded.size,
  };
}

export function isImageFile(file: FileAttachment): boolean {
  return checkIsImage(file);
}

export function isPdfFile(file: FileAttachment): boolean {
  return checkIsPdf(file);
}

export function isTextFile(file: FileAttachment): boolean {
  return checkIsText(file);
}

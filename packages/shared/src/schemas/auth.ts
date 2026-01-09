import { z } from 'zod';

// Register Schema
export const RegisterSchema = z.object({
  email: z.string().email('无效的邮箱地址'),
  password: z
    .string()
    .min(8, '密码至少需要8个字符')
    .regex(/[A-Z]/, '密码必须包含至少一个大写字母')
    .regex(/[a-z]/, '密码必须包含至少一个小写字母')
    .regex(/[0-9]/, '密码必须包含至少一个数字'),
  name: z.string().min(1).max(100).optional(),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;

// Login Schema
export const LoginSchema = z.object({
  email: z.string().email('无效的邮箱地址'),
  password: z.string().min(1, '请输入密码'),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// Change Password Schema
export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z
    .string()
    .min(8, '密码至少需要8个字符')
    .regex(/[A-Z]/, '密码必须包含至少一个大写字母')
    .regex(/[a-z]/, '密码必须包含至少一个小写字母')
    .regex(/[0-9]/, '密码必须包含至少一个数字'),
});

export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

// Update Profile Schema
export const UpdateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatar: z.string().url().optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>;

// Refresh Token Schema
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, '请提供刷新令牌'),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;

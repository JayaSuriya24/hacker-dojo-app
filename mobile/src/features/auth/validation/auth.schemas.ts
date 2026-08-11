import { z } from 'zod';

/**
 * Form schemas.
 *
 * These mirror the server's rules rather than replacing them. The point is
 * feedback latency: a member learns their password is too short before a round
 * trip, not instead of the server checking. Supabase enforces the same minimum
 * (`supabase/config.toml` → `auth.password`), and the API validates every field
 * again on arrival.
 *
 * Messages are written to be shown as-is — each one says what to do, not what
 * rule was broken.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .email("That email doesn't look right. Check for a typo.");

/**
 * A US mobile number. Kept lenient about formatting — members type
 * "(650) 555-0142" and reformatting is the app's job, not theirs — and strict
 * about digit count.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ''))
  .refine((digits) => digits.length === 10, 'Enter the 10-digit number on your membership record.');

/**
 * Sign-in password: only a length floor. Applying the full strength policy here
 * would reject members whose password predates it and lock them out of their
 * own account.
 */
export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password.'),
  remember: z.boolean().default(true),
});

export type SignInValues = z.input<typeof signInSchema>;

/** Sign-up password: the full policy, matching `auth.password` in config.toml. */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .regex(/[a-z]/, 'Include a lowercase letter.')
  .regex(/[A-Z]/, 'Include a capital letter.')
  .regex(/[0-9]/, 'Include a number.');

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter the name you'd like on your keycard.")
    .max(120, 'That name is too long.'),
  email: emailSchema,
  password: passwordSchema,
  // `boolean().refine(...)` rather than `literal(true)`: the literal's INPUT
  // type is `true`, which makes an unchecked default (`false`) a type error in
  // the form's defaultValues. This keeps the input `boolean` and still refuses
  // to submit until it is checked.
  agree: z.boolean().refine((value) => value, 'Accept the code of conduct to continue.'),
});

export type SignUpValues = z.input<typeof signUpSchema>;

export const otpRequestSchema = z
  .object({
    channel: z.enum(['email', 'phone']),
    email: z.string().optional(),
    phone: z.string().optional(),
  })
  .superRefine((values, ctx) => {
    // Only validate the field the member is actually using — requiring both
    // would block the form on a channel they never touched.
    if (values.channel === 'email') {
      const result = emailSchema.safeParse(values.email ?? '');
      if (!result.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['email'],
          message: result.error.issues[0]?.message ?? '',
        });
      }
    } else {
      const result = phoneSchema.safeParse(values.phone ?? '');
      if (!result.success) {
        ctx.addIssue({
          code: 'custom',
          path: ['phone'],
          message: result.error.issues[0]?.message ?? '',
        });
      }
    }
  });

export type OtpRequestValues = z.input<typeof otpRequestSchema>;

export const otpVerifySchema = z.object({
  token: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code we sent you.'),
});

export type OtpVerifyValues = z.input<typeof otpVerifySchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordValues = z.input<typeof forgotPasswordSchema>;

/**
 * Password strength, 0–4, for the meter under the sign-up field.
 *
 * Indicative only. The schema above is what actually gates submission — a meter
 * that blocks the button would be a rule hidden inside a decoration.
 */
export function passwordStrength(password: string): number {
  if (!password) return 0;
  return [
    password.length >= 8,
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
}

export function strengthHint(password: string): string {
  if (password.length === 0) return 'Eight characters minimum.';
  const score = passwordStrength(password);
  if (score < 3) return 'Add a capital, a number or a symbol.';
  return 'Strong password.';
}

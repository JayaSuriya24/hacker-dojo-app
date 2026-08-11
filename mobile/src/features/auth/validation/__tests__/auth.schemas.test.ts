import {
  emailSchema,
  otpVerifySchema,
  passwordSchema,
  passwordStrength,
  phoneSchema,
  signInSchema,
  signUpSchema,
  strengthHint,
} from '../auth.schemas';

describe('emailSchema', () => {
  it('accepts a normal address and trims surrounding space', () => {
    expect(emailSchema.parse('  ana@reyes.dev  ')).toBe('ana@reyes.dev');
  });

  it.each(['ana', 'ana@', '@reyes.dev', 'ana reyes@dev.com'])('rejects %s', (value) => {
    expect(emailSchema.safeParse(value).success).toBe(false);
  });
});

describe('phoneSchema', () => {
  it('strips formatting and keeps the ten digits', () => {
    expect(phoneSchema.parse('(650) 555-0142')).toBe('6505550142');
  });

  it('rejects a number that is too short once formatting is removed', () => {
    expect(phoneSchema.safeParse('650-555').success).toBe(false);
  });

  it('rejects an eleven-digit number — the +1 is added separately', () => {
    expect(phoneSchema.safeParse('16505550142').success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a password meeting every rule', () => {
    expect(passwordSchema.safeParse('Dojo2009build').success).toBe(true);
  });

  it.each([
    ['Sh0rt', 'too short'],
    ['alllowercase1', 'no capital'],
    ['ALLUPPERCASE1', 'no lowercase'],
    ['NoDigitsHere', 'no number'],
  ])('rejects %s (%s)', (value) => {
    expect(passwordSchema.safeParse(value).success).toBe(false);
  });

  it('reports the specific rule that failed, not a generic message', () => {
    const result = passwordSchema.safeParse('nodigitshere');
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        'Include a capital letter.',
      );
    }
  });
});

describe('signInSchema', () => {
  it('applies only a length floor to the password', () => {
    // A member whose password predates the strength policy must still be able
    // to sign in — the full policy applies to NEW passwords only.
    expect(
      signInSchema.safeParse({ email: 'ana@reyes.dev', password: 'old', remember: true }).success,
    ).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(
      signInSchema.safeParse({ email: 'ana@reyes.dev', password: '', remember: true }).success,
    ).toBe(false);
  });
});

describe('signUpSchema', () => {
  const valid = {
    fullName: 'Ana Reyes',
    email: 'ana@reyes.dev',
    password: 'Dojo2009build',
    agree: true,
  };

  it('accepts a complete submission', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses to submit until the code of conduct is accepted', () => {
    const result = signUpSchema.safeParse({ ...valid, agree: false });
    expect(result.success).toBe(false);
  });

  it('rejects a one-character name', () => {
    expect(signUpSchema.safeParse({ ...valid, fullName: 'A' }).success).toBe(false);
  });
});

describe('otpVerifySchema', () => {
  it('accepts exactly six digits', () => {
    expect(otpVerifySchema.safeParse({ token: '123456' }).success).toBe(true);
  });

  it.each(['12345', '1234567', '12a456', ''])('rejects %s', (token) => {
    expect(otpVerifySchema.safeParse({ token }).success).toBe(false);
  });
});

describe('passwordStrength', () => {
  it('scores an empty password as zero', () => {
    expect(passwordStrength('')).toBe(0);
  });

  it('awards one point per satisfied rule, capped at four', () => {
    expect(passwordStrength('abcdefgh')).toBe(1);
    expect(passwordStrength('Abcdefgh')).toBe(2);
    expect(passwordStrength('Abcdefg1')).toBe(3);
    expect(passwordStrength('Abcdefg1!')).toBe(4);
  });
});

describe('strengthHint', () => {
  it('prompts for length before anything else', () => {
    expect(strengthHint('')).toMatch(/eight characters/i);
  });

  it('suggests what is missing on a weak password', () => {
    expect(strengthHint('abcdefgh')).toMatch(/capital|number|symbol/i);
  });

  it('confirms a strong one', () => {
    expect(strengthHint('Abcdefg1!')).toBe('Strong password.');
  });
});

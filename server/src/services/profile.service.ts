import { profileRepository, type ProfilePatch } from '../repositories/profile.repository.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { MemberRole } from '../types/database.js';

export interface MeView {
  id: string;
  email: string;
  name: string;
  initials: string;
  avatarPath: string | null;
  role: MemberRole;
  bio: string | null;
  company: string | null;
  currentProject: string | null;
  skills: string[];
  directoryVisible: boolean;
  memberSince: string | null;
  /** Drives every gated surface in the app. */
  isActiveMember: boolean;
  membership: {
    planId: string;
    planName: string;
    status: string;
    period: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
  } | null;
}

/** A member may carry at most this many skills on their directory card. */
const MAX_SKILLS = 8;

export const profileService = {
  async me(user: AuthenticatedUser): Promise<MeView> {
    const [profile, membership, plans] = await Promise.all([
      profileRepository.findById(user.id),
      profileRepository.membership(user.accessToken, user.id),
      profileRepository.plans(),
    ]);

    if (!profile) throw AppError.notFound('Your profile is missing. Contact a steward.');

    const plan = membership ? plans.find((p) => p.id === membership.plan_id) : undefined;

    return {
      id: profile.id,
      email: profile.email,
      name: profile.full_name,
      initials: profile.initials,
      avatarPath: profile.avatar_path,
      role: profile.role,
      bio: profile.bio,
      company: profile.company,
      currentProject: profile.current_project,
      skills: profile.skills,
      directoryVisible: profile.directory_visible,
      memberSince: profile.member_since,
      isActiveMember: user.isActiveMember,
      membership: membership
        ? {
            planId: membership.plan_id,
            planName: plan?.name ?? membership.plan_id,
            status: membership.status,
            period: membership.period,
            currentPeriodEnd: membership.current_period_end,
            cancelAtPeriodEnd: membership.cancel_at_period_end,
          }
        : null,
    };
  },

  /**
   * Update the caller's own card.
   *
   * `role` is not in `ProfilePatch` and the RLS policy pins it besides, so a
   * request carrying one is discarded by the validator before it reaches here —
   * three independent layers, because privilege escalation is the failure that
   * matters most on this endpoint.
   */
  async update(user: AuthenticatedUser, patch: ProfilePatch): Promise<MeView> {
    if (patch.skills && patch.skills.length > MAX_SKILLS) {
      throw AppError.badRequest(`Pick up to ${MAX_SKILLS} skills for your card.`);
    }

    await profileRepository.update(user.accessToken, user.id, patch);
    return this.me(user);
  },

  async notificationPreferences(user: AuthenticatedUser) {
    const row = await profileRepository.notificationPreferences(user.accessToken, user.id);
    return {
      events: row.events,
      bookings: row.bookings,
      weeklyDigest: row.weekly_digest,
      hasPushToken: row.push_token !== null,
    };
  },

  async updateNotificationPreferences(
    user: AuthenticatedUser,
    patch: { events?: boolean; bookings?: boolean; weeklyDigest?: boolean; pushToken?: string },
  ) {
    const row = await profileRepository.updateNotificationPreferences(user.accessToken, user.id, {
      ...(patch.events !== undefined ? { events: patch.events } : {}),
      ...(patch.bookings !== undefined ? { bookings: patch.bookings } : {}),
      ...(patch.weeklyDigest !== undefined ? { weekly_digest: patch.weeklyDigest } : {}),
      ...(patch.pushToken !== undefined ? { push_token: patch.pushToken } : {}),
    });

    return {
      events: row.events,
      bookings: row.bookings,
      weeklyDigest: row.weekly_digest,
      hasPushToken: row.push_token !== null,
    };
  },

  async plans() {
    const rows = await profileRepository.plans();
    return rows.map((plan) => ({
      id: plan.id,
      name: plan.name,
      description: plan.description,
      priceMonthlyCents: plan.price_monthly_cents,
      priceAnnualCents: plan.price_annual_cents,
      isAddon: plan.is_addon,
      isPopular: plan.is_popular,
      requiresProof: plan.requires_proof,
      /** Annual saving in cents, or null when the plan has no annual rate. */
      annualSavingCents:
        plan.price_annual_cents !== null
          ? plan.price_monthly_cents * 12 - plan.price_annual_cents
          : null,
    }));
  },
};

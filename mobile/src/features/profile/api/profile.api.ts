import { api } from '~/services/api/client';
import type { Me, NotificationPreferences, Plan } from '~/types/domain';

/**
 * Profile endpoints. This layer is URLs and types only — no caching, no
 * transformation, no error handling. Those belong to React Query and the
 * shared client respectively.
 */
export const profileApi = {
  me: () => api.get<Me>('/me'),

  update: (patch: {
    full_name?: string;
    bio?: string;
    company?: string;
    current_project?: string;
    skills?: string[];
    directory_visible?: boolean;
    avatar_path?: string;
    /** One-way: records that the skills prompt has run. Never sent as false. */
    skills_prompted?: true;
  }) => api.patch<Me>('/me', patch),

  notifications: () => api.get<NotificationPreferences>('/me/notifications'),

  updateNotifications: (patch: {
    events?: boolean;
    bookings?: boolean;
    weeklyDigest?: boolean;
    pushToken?: string;
  }) => api.patch<NotificationPreferences>('/me/notifications', patch),

  // Public: the pricing table renders before anyone signs in.
  plans: () => api.get<Plan[]>('/plans', { anonymous: true }),
};

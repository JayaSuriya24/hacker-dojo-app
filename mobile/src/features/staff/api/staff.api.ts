import { api } from '~/services/api/client';
import type {
  ApplicationStatus,
  ContentBlock,
  MemberDocument,
  StaffDashboard,
  StaffQueueItem,
  StaffQueueKind,
  TourStatus,
} from '~/types/domain';

export const staffApi = {
  dashboard: () => api.get<StaffDashboard>('/staff/dashboard'),

  queue: (filters: { kind?: StaffQueueKind; status?: string } = {}) =>
    api.get<StaffQueueItem[]>('/staff/queue', {
      query: { kind: filters.kind, status: filters.status, limit: 100 },
    }),

  setTourStatus: (id: string, status: TourStatus) =>
    api.patch<{ id: string; status: TourStatus }>(`/staff/tours/${id}`, { status }),

  setEventRequestStatus: (id: string, status: ApplicationStatus) =>
    api.patch<{ id: string; status: ApplicationStatus }>(`/staff/event-requests/${id}`, { status }),

  setApplicationStatus: (id: string, status: ApplicationStatus) =>
    api.patch<{ id: string; status: ApplicationStatus }>(`/staff/applications/${id}`, { status }),

  pendingDocuments: () => api.get<MemberDocument[]>('/staff/documents'),

  reviewDocument: (id: string, input: { status: 'approved' | 'rejected'; reviewNote?: string }) =>
    api.patch<MemberDocument>(`/staff/documents/${id}`, input),

  grantCertification: (input: { profileId: string; resourceId: string; expiresAt?: string }) =>
    api.post<{ id: string }>('/staff/certifications', input),

  content: () => api.get<ContentBlock[]>('/staff/content'),

  upsertContent: (input: {
    slot: string;
    key: string;
    label: string;
    value?: string;
    sortOrder?: number;
    active?: boolean;
  }) => api.patch<ContentBlock>('/staff/content', input),
};

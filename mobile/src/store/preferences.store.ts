import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { EventCategory } from '~/types/domain';

/**
 * Local UI state only.
 *
 * The rule this store obeys: nothing here is server state. Events, bookings,
 * the directory and the profile all live in React Query, which owns fetching,
 * caching and invalidation for them. Duplicating any of it here would create
 * two sources of truth that drift the moment a mutation lands.
 *
 * What does belong here: the appearance override, filter selections, and the
 * onboarding flag — state the server has no opinion about.
 */

export type AppearanceMode = 'system' | 'light' | 'dark';
export type CommunityTab = 'here' | 'members' | 'startups';
export type BookTab = 'hardware' | 'rooms' | 'mine';

interface PreferencesState {
  appearance: AppearanceMode;
  hasSeenOnboarding: boolean;

  // Filters. Persisted so returning to a tab restores the view the member left.
  eventCategory: EventCategory | 'All';
  communityTab: CommunityTab;
  bookTab: BookTab;
  directorySkills: string[];
  billingPeriod: 'mo' | 'yr';
  hapticsEnabled: boolean;

  setAppearance: (mode: AppearanceMode) => void;
  completeOnboarding: () => void;
  setEventCategory: (category: EventCategory | 'All') => void;
  setCommunityTab: (tab: CommunityTab) => void;
  setBookTab: (tab: BookTab) => void;
  toggleDirectorySkill: (skill: string) => void;
  clearDirectorySkills: () => void;
  setBillingPeriod: (period: 'mo' | 'yr') => void;
  setHapticsEnabled: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      appearance: 'system',
      hasSeenOnboarding: false,
      eventCategory: 'All',
      communityTab: 'here',
      bookTab: 'hardware',
      directorySkills: [],
      billingPeriod: 'mo',
      hapticsEnabled: true,

      setAppearance: (appearance) => set({ appearance }),
      completeOnboarding: () => set({ hasSeenOnboarding: true }),
      setEventCategory: (eventCategory) => set({ eventCategory }),
      setCommunityTab: (communityTab) => set({ communityTab }),
      setBookTab: (bookTab) => set({ bookTab }),

      toggleDirectorySkill: (skill) =>
        set((state) => ({
          directorySkills: state.directorySkills.includes(skill)
            ? state.directorySkills.filter((entry) => entry !== skill)
            : [...state.directorySkills, skill],
        })),

      clearDirectorySkills: () => set({ directorySkills: [] }),
      setBillingPeriod: (billingPeriod) => set({ billingPeriod }),
      setHapticsEnabled: (hapticsEnabled) => set({ hapticsEnabled }),
    }),
    {
      name: 'hackerdojo.preferences',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // Transient selections are not worth persisting; restoring a stale
      // "Who's here" filter after a week is noise, not continuity.
      partialize: (state) => ({
        appearance: state.appearance,
        hasSeenOnboarding: state.hasSeenOnboarding,
        eventCategory: state.eventCategory,
        billingPeriod: state.billingPeriod,
        hapticsEnabled: state.hapticsEnabled,
      }),
    },
  ),
);

/**
 * Selector hooks.
 *
 * Subscribing to a slice rather than the whole store means a component
 * re-renders only when the value it reads actually changes — a filter chip does
 * not re-render because the appearance mode moved.
 */
export const useAppearance = () => usePreferencesStore((state) => state.appearance);
export const useHaptics = () => usePreferencesStore((state) => state.hapticsEnabled);

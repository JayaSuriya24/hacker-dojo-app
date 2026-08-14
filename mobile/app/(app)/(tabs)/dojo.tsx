import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { XStack, YStack } from 'tamagui';
import {
  Avatar,
  Button,
  Card,
  ListSkeleton,
  Screen,
  ScreenHeader,
  Section,
  Text,
} from '~/components/ui';
import { PricingTable } from '~/features/dojo/components/PricingTable';
import { FaqList } from '~/features/dojo/components/FaqList';
import { useMe, usePlans, useShouldOfferTour } from '~/features/profile/hooks/useProfile';
import { useBillingPortal } from '~/features/payments/hooks/usePayments';
import { useAbout, usePrograms } from '~/features/community/hooks/useCommunity';
import { usePreferencesStore } from '~/store/preferences.store';
import { resolvePeriod, toChoice } from '~/features/payments/billingPeriod';
import { usePalette } from '~/providers/ThemeProvider';
import { dojo } from '~/constants/config';
import { userMessage } from '~/services/api/errors';
import { space } from '~/theme/tokens';
import type { Plan } from '~/types/domain';

/**
 * The Dojo tab — programs, membership, the nonprofit's story, and settings.
 *
 * The longest surface in the app, so it is composed from independently-loading
 * sections: plans, programs and the about content are three separate queries,
 * and a slow one shows its own skeleton rather than holding the whole page.
 */
export default function DojoScreen() {
  const palette = usePalette();
  const { data: me } = useMe();
  const plans = usePlans();
  const programs = usePrograms();
  const about = useAbout();

  const storedPeriod = usePreferencesStore((state) => state.billingPeriod);

  /**
   * A member already on an annual plan should see the control on Annual, not on
   * whatever they last browsed. Their own membership is the better default;
   * touching the control still wins from then on.
   */
  const period = me?.membership ? toChoice(me.membership.period) : storedPeriod;

  const [testimonialIndex, setTestimonialIndex] = useState(0);
  const billingPortal = useBillingPortal();

  const isMember = me?.isActiveMember ?? false;
  const showTour = useShouldOfferTour();
  const testimonials = about.data?.testimonials ?? [];
  const testimonial = testimonials[testimonialIndex];

  const onRefresh = useCallback(() => {
    void plans.refetch();
    void programs.refetch();
    void about.refetch();
  }, [plans, programs, about]);

  /**
   * Open checkout for a plan at the period the member actually selected.
   *
   * Both branches of the previous ternary read `'month'`, so choosing Annual
   * showed the annual price and the saving chip and then charged monthly.
   * `resolvePeriod` is the single place that maps the control's `'mo' | 'yr'`
   * onto the API's `'month' | 'year'`, and it also carries the rule that
   * add-ons bill monthly regardless of the toggle.
   */
  const choosePlan = useCallback(
    (plan: Plan) => {
      router.push({
        pathname: '/(app)/checkout',
        params: { planId: plan.id, period: resolvePeriod(period, plan) },
      });
    },
    [period],
  );

  return (
    <Screen onRefresh={onRefresh} refreshing={plans.isRefetching || about.isRefetching}>
      <ScreenHeader eyebrow={`Since 2009 · 501(c)(3)`} title="The Dojo" />

      {/* ---- Flagship program ------------------------------------------- */}
      <Card tone="accent">
        <Text variant="eyebrow">Flagship program</Text>
        <Text variant="heading" marginTop={space[2]}>
          AI Career Initiative
        </Text>
        <Text variant="small" tone="muted" marginTop={space[2]}>
          Three tracks for engineers and operators rebuilding their leverage in an AI-shaped market.
        </Text>
        <YStack marginTop={space[4]} alignSelf="flex-start">
          <Button onPress={() => router.push('/(app)/program/aci')}>See the three tracks</Button>
        </YStack>
      </Card>

      {/* ---- Programs ---------------------------------------------------- */}
      <Section title="Programs">
        {programs.isPending ? (
          <ListSkeleton count={4} height={64} />
        ) : (
          (programs.data ?? []).map((program) => (
            <Pressable
              key={program.id}
              onPress={() => router.push(`/(app)/program/${program.id}`)}
              role="button"
              aria-label={`${program.name}. ${program.meta}`}
              accessibilityHint="Opens the program details"
            >
              <Card interactive flexDirection="row" alignItems="center" gap={space[4]}>
                <YStack flex={1} gap={space[1]}>
                  <Text variant="subtitle">{program.name}</Text>
                  <Text variant="small" tone="subtle">
                    {program.meta}
                  </Text>
                </YStack>
                <Text variant="title" tone="subtle">
                  ›
                </Text>
              </Card>
            </Pressable>
          ))
        )}
      </Section>

      {/* ---- Membership -------------------------------------------------- */}
      {/*
        No billing-period control: every plan is monthly-only, so the toggle
        offered a choice that resolved back to Monthly whichever side was
        pressed. The `period` plumbing below stays — `resolvePeriod` already
        answers 'month' for a plan with no annual price, so restoring the
        control is putting this Segmented back and nothing else.
      */}
      <Section title="Membership">
        {isMember && me?.membership ? (
          <Card borderColor="$accentBorder">
            <XStack alignItems="baseline" gap={space[3]}>
              <Text variant="subtitle" flex={1}>
                {me.membership.planName} — active
              </Text>
              <Text variant="mono" tone="accent">
                {me.membership.period === 'year' ? 'Annual' : 'Monthly'}
              </Text>
            </XStack>
            <Text variant="small" tone="subtle" marginTop={space[2]}>
              {me.membership.cancelAtPeriodEnd
                ? 'Ends at the close of this period'
                : me.membership.currentPeriodEnd
                  ? `Renews ${new Date(me.membership.currentPeriodEnd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                  : 'Active'}
            </Text>
            <YStack marginTop={space[4]} gap={space[2]}>
              <Button
                variant="secondary"
                fullWidth
                loading={billingPortal.isPending}
                onPress={() => billingPortal.mutate()}
                accessibilityHint="Opens Stripe to change your plan or payment method"
              >
                Manage billing
              </Button>

              {/*
                The failure was silent: the mutation had no error branch, so a
                member tapped Manage billing, watched the spinner stop, and was
                told nothing at all. Stripe being unreachable is exactly when
                someone needs a sentence rather than a button that appears to
                do nothing.
              */}
              {billingPortal.isError ? (
                <Text variant="small" tone="error" aria-live="polite">
                  {userMessage(billingPortal.error)}
                </Text>
              ) : null}
            </YStack>
          </Card>
        ) : null}

        {plans.isPending ? (
          <ListSkeleton count={3} height={160} />
        ) : (
          <PricingTable
            plans={plans.data ?? []}
            period={period}
            activePlanId={me?.membership?.planId}
            isMember={isMember}
            onChoose={choosePlan}
          />
        )}
      </Section>

      {/* ---- Tour and giving --------------------------------------------- */}
      {/*
        The tour is an invitation, and an invitation only makes sense to someone
        who has not already accepted it. A member has the door in their pocket,
        and someone with a tour already booked reads a second invitation as the
        booking having failed to register — so both retire the button.

        `hasBookedTour` comes from the API rather than a local flag: the tour may
        have been booked on another device, or on the marketing site before this
        account existed, and a flag on this phone would not know about either.

        Giving carries no such condition. A donation is welcome from anyone, at
        any point, however many times — so it is the one that stays and widens
        to fill the row on its own.
      */}
      <Section>
        <XStack gap={space[3]}>
          {showTour ? (
            <YStack flex={1}>
              <Button variant="primary" fullWidth onPress={() => router.push('/(app)/tour')}>
                Take a tour
              </Button>
            </YStack>
          ) : null}

          <YStack flex={1} gap={space[2]}>
            <Button variant="secondary" fullWidth onPress={() => router.push('/(app)/donate')}>
              Support the Dojo
            </Button>
            <Text variant="caption" tone="subtle">
              Tax-deductible. Keeps the doors open, the labs stocked and community events free.
            </Text>
          </YStack>
        </XStack>
      </Section>

      {/* ---- Pillars ----------------------------------------------------- */}
      {/* Same guard, same reason. The six that used to fill this section were
          written by nobody at the Dojo; the slot stays so staff can put the
          real ones in, and stays invisible until they do. */}
      {about.data?.pillars.length ? (
        <Section title="What we stand for">
          <XStack flexWrap="wrap" gap={space[2]}>
            {about.data.pillars.map((pillar) => (
              <Card key={pillar.key} tone="alt" width="31.5%" padded="tight" alignItems="center">
                <Text variant="small">{pillar.name}</Text>
                <Text variant="caption" tone="subtle" center>
                  {pillar.line}
                </Text>
              </Card>
            ))}
          </XStack>
        </Section>
      ) : null}

      {/* ---- Testimonials ------------------------------------------------ */}
      {testimonial ? (
        <Section title="Voices">
          <Card>
            {/* `polite` announces the new quote when the member advances the
                carousel, without interrupting whatever is being read. */}
            <View aria-live="polite">
              <Text variant="subtitle" lineHeight={22}>
                “{testimonial.quote}”
              </Text>
            </View>

            <XStack alignItems="center" gap={space[4]} marginTop={space[4]}>
              <Avatar
                name={testimonial.name}
                initials={testimonial.initials}
                size={34}
                seed={testimonial.id}
              />
              <YStack flex={1}>
                <Text variant="small">{testimonial.name}</Text>
                <Text variant="caption" tone="subtle">
                  {testimonial.role}
                </Text>
              </YStack>

              <XStack gap={space[2]}>
                <Button
                  variant="secondary"
                  size="sm"
                  haptic="none"
                  aria-label="Previous quote"
                  onPress={() =>
                    setTestimonialIndex(
                      (index) => (index - 1 + testimonials.length) % testimonials.length,
                    )
                  }
                >
                  ‹
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  haptic="none"
                  aria-label="Next quote"
                  onPress={() => setTestimonialIndex((index) => (index + 1) % testimonials.length)}
                >
                  ›
                </Button>
              </XStack>
            </XStack>
          </Card>
        </Section>
      ) : null}

      {/* ---- Press ------------------------------------------------------- */}
      {about.data?.press.length ? (
        <Section title="In the press">
          <Card padded="none">
            {about.data.press.map((mention, index) => (
              <XStack
                key={mention.id}
                gap={space[4]}
                paddingHorizontal={space[5]}
                paddingVertical={space[4]}
                borderTopWidth={index === 0 ? 0 : 1}
                borderTopColor="$borderColor"
              >
                <Text variant="mono" tone="subtle" width={44}>
                  {mention.year}
                </Text>
                <Text variant="small" tone="muted" flex={1}>
                  {mention.headline}
                </Text>
              </XStack>
            ))}
          </Card>
        </Section>
      ) : null}

      {/* ---- Board ------------------------------------------------------- */}
      {about.data?.board.length ? (
        <Section title="Board & advisors">
          <XStack flexWrap="wrap" gap={space[2]}>
            {about.data.board.map((member) => (
              <Card
                key={member.id}
                tone="alt"
                width="48.5%"
                padded="tight"
                flexDirection="row"
                alignItems="center"
                gap={space[3]}
              >
                <Avatar name={member.name} initials={member.initials} size={30} seed={member.id} />
                <YStack flex={1} gap={space[0]}>
                  <Text variant="caption" tone="default" numberOfLines={1}>
                    {member.name}
                  </Text>
                  <Text variant="caption" tone="subtle" numberOfLines={1}>
                    {member.role}
                  </Text>
                </YStack>
              </Card>
            ))}
          </XStack>
        </Section>
      ) : null}

      {/* ---- FAQ --------------------------------------------------------- */}
      {about.data?.faqs.length ? (
        <Section title="Help & FAQ">
          <FaqList faqs={about.data.faqs} />
        </Section>
      ) : null}

      {/* ---- Profile & settings ------------------------------------------ */}
      <Section title="Profile & settings">
        <Pressable
          onPress={() => router.push('/(app)/settings')}
          role="button"
          aria-label="Profile and settings"
        >
          <Card interactive flexDirection="row" alignItems="center" gap={space[4]}>
            {me ? (
              <Avatar
                name={me.name}
                initials={me.initials}
                imageUrl={me.avatarUrl}
                size={46}
                seed={me.id}
              />
            ) : null}
            <YStack flex={1} gap={space[1]}>
              <Text variant="title">{me?.name ?? 'Your profile'}</Text>
              <Text variant="caption" tone="subtle">
                {isMember ? (me?.membership?.planName ?? 'Member') : 'Guest'}
                {me?.memberSince
                  ? ` · since ${new Date(me.memberSince).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}`
                  : ''}
              </Text>
            </YStack>
            <Text variant="title" tone="subtle">
              ›
            </Text>
          </Card>
        </Pressable>
      </Section>

      <YStack marginTop={space[8]} gap={space[1]} alignItems="center">
        <Text variant="caption" tone="subtle" center>
          Hacker Dojo · {dojo.addressLine1}, {dojo.addressLine2}
        </Text>
        <Text variant="caption" tone="subtle" center>
          A 501(c)(3) nonprofit · EIN {dojo.ein}
        </Text>
      </YStack>

      <View style={{ height: space[8], backgroundColor: palette.background }} />
    </Screen>
  );
}

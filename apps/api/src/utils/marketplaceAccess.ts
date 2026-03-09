import type { BookingLane, StaffTier, SubscriptionStatus, SubscriptionTier } from "@prisma/client";

type ClientAccessInput = {
  subscriptionTier: SubscriptionTier | null;
  subscriptionStatus: SubscriptionStatus | null;
};

export type MarketplaceAccess = {
  effectiveTier: SubscriptionTier;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus | null;
  hasActivePremium: boolean;
  premiumInactive: boolean;
  marketplaceAccessLane: Extract<BookingLane, "FLEX" | "SELECT">;
};

export function resolveMarketplaceAccess(client: ClientAccessInput): MarketplaceAccess {
  const subscriptionTier = client.subscriptionTier === "PREMIUM" ? "PREMIUM" : "STANDARD";
  const hasActivePremium =
    subscriptionTier === "PREMIUM" && client.subscriptionStatus === "ACTIVE";

  return {
    effectiveTier: hasActivePremium ? "PREMIUM" : "STANDARD",
    subscriptionTier,
    subscriptionStatus: client.subscriptionStatus,
    hasActivePremium,
    premiumInactive: subscriptionTier === "PREMIUM" && !hasActivePremium,
    marketplaceAccessLane: hasActivePremium ? "SELECT" : "FLEX",
  };
}

export function premiumAccessErrorMessage() {
  return "Your Select marketplace access is not active. Reactivate it to unlock Select rates and vetted Select talent.";
}

export function resolveMarketplaceBookingLane(staffTier: StaffTier | null | undefined): BookingLane | null {
  if (staffTier === "ELITE") return "SELECT";
  if (staffTier === "STANDARD") return "FLEX";
  return null;
}

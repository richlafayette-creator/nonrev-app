export const REQUEST_CREDIT_COST = 1
export const ANSWER_REWARD_CREDITS = 2

export type CreditState = {
  available: number
  reserved: number
  earned: number
}

export function canSpendCredits(balance: CreditState, cost = REQUEST_CREDIT_COST) {
  return balance.available >= cost
}

export function spendRequestCredit(balance: CreditState, cost = REQUEST_CREDIT_COST): CreditState {
  if (!canSpendCredits(balance, cost)) return balance
  return {
    ...balance,
    available: balance.available - cost,
    reserved: balance.reserved + cost
  }
}

export function settleRequestCredit(balance: CreditState, cost = REQUEST_CREDIT_COST): CreditState {
  return {
    ...balance,
    reserved: Math.max(0, balance.reserved - cost)
  }
}

export function rewardResponder(balance: CreditState, reward = ANSWER_REWARD_CREDITS): CreditState {
  return {
    ...balance,
    available: balance.available + reward,
    earned: balance.earned + reward
  }
}

export const stripeCatalog = [
  {
    id: 'starter-pack',
    name: 'Starter credit pack',
    credits: 10,
    priceLabel: '$9 scaffold',
    lookupKey: 'credits_starter_10'
  },
  {
    id: 'frequent-flyer-pack',
    name: 'Frequent flyer pack',
    credits: 30,
    priceLabel: '$24 scaffold',
    lookupKey: 'credits_frequent_30'
  },
  {
    id: 'pro-watchlist',
    name: 'Pro watchlist subscription',
    credits: 50,
    priceLabel: '$19/mo scaffold',
    lookupKey: 'pro_watchlist_monthly'
  }
]

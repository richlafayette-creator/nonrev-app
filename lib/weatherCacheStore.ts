import { InMemoryWeatherCacheStore } from './weatherCache'

/**
 * Shared server-side route weather cache store.
 *
 * This module intentionally depends only on the cache abstraction. It must not
 * import refresh or provider adapters, so itinerary intelligence can read cached
 * weather without gaining a provider-call path.
 */
export const internalWeatherPrefetchStore = new InMemoryWeatherCacheStore()

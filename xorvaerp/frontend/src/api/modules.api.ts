import client from './client';
import type { ApiResponse } from './auth.api';

/** One subscribable module in the marketplace, with the tenant's current status. */
export interface ModuleCatalogEntry {
  key: string;
  displayName: string;
  description: string;
  dependsOn: string[];
  isSubscribed: boolean;
}

/** The tenant's module subscription + the full subscribable catalog. */
export interface TenantSubscription {
  planKey: string;
  subscribedModules: string[];
  availableModules: ModuleCatalogEntry[];
}

/** One installed module (from the module registry). */
export interface ModuleCatalogItem {
  key: string;
  displayName: string;
  description: string;
  dependsOn: string[];
  isCore: boolean;
}

export const modulesApi = {
  /** Full installed-module catalog (core + subscribable). */
  catalog: () => client.get<ApiResponse<ModuleCatalogItem[]>>('/modules/catalog'),

  /** The tenant's subscription + subscribable catalog with flags (marketplace view). */
  getSubscription: () => client.get<ApiResponse<TenantSubscription>>('/modules/subscription'),

  /** Replace the tenant's subscribed modules. SuperAdmin only. Returns the updated view. */
  setSubscription: (modules: string[]) =>
    client.put<ApiResponse<TenantSubscription>>('/modules/subscription', { modules }),
};

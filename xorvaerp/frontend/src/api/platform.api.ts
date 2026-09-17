import client from './client';
import type { ApiResponse } from './auth.api';

/** Input types for a dynamic field (mirrors backend FieldType, serialized as string). */
export type FieldType =
  | 'Text' | 'TextArea' | 'Number' | 'Currency' | 'Date' | 'Boolean' | 'Select' | 'Email' | 'Phone';

export const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'Text', label: 'Text' },
  { value: 'TextArea', label: 'Long text' },
  { value: 'Number', label: 'Number' },
  { value: 'Currency', label: 'Currency' },
  { value: 'Date', label: 'Date' },
  { value: 'Boolean', label: 'Yes / No' },
  { value: 'Select', label: 'Dropdown' },
  { value: 'Email', label: 'Email' },
  { value: 'Phone', label: 'Phone' },
];

export interface FieldDefinition {
  id: string;
  key: string;
  label: string;
  type: FieldType;
  isRequired: boolean;
  sortOrder: number;
  options?: string[] | null;
  placeholder?: string | null;
}

export interface EntityDefinition {
  id: string;
  key: string;
  label: string;
  pluralLabel: string;
  moduleKey: string;
  attachTo?: string | null;
  icon?: string | null;
  description?: string | null;
  isActive: boolean;
  fields: FieldDefinition[];
}

export interface CustomRecord {
  id: string;
  entityDefinitionId: string;
  parentId?: string | null;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt?: string | null;
}

/** A field to create on a new sub-module. */
export interface FieldInput {
  label: string;
  type: FieldType;
  isRequired: boolean;
  options?: string[] | null;
  placeholder?: string | null;
}

export interface CreateEntityDefinitionInput {
  label: string;
  pluralLabel?: string;
  moduleKey?: string;
  attachTo?: string;
  icon?: string;
  description?: string;
  fields: FieldInput[];
}

export const platformApi = {
  listDefinitions: (moduleKey?: string, attachTo?: string) =>
    client.get<ApiResponse<EntityDefinition[]>>('/platform/entity-definitions', { params: { moduleKey, attachTo } }),

  getDefinition: (id: string) =>
    client.get<ApiResponse<EntityDefinition>>(`/platform/entity-definitions/${id}`),

  createDefinition: (input: CreateEntityDefinitionInput) =>
    client.post<ApiResponse<EntityDefinition>>('/platform/entity-definitions', input),

  listRecords: (entityDefinitionId: string, companyId?: string, parentId?: string) =>
    client.get<ApiResponse<CustomRecord[]>>('/platform/records', { params: { entityDefinitionId, companyId, parentId } }),

  createRecord: (entityDefinitionId: string, data: Record<string, unknown>, companyId?: string, parentId?: string) =>
    client.post<ApiResponse<CustomRecord>>('/platform/records', { entityDefinitionId, companyId, parentId, data }),

  updateRecord: (id: string, data: Record<string, unknown>) =>
    client.put<ApiResponse<CustomRecord>>(`/platform/records/${id}`, { data }),

  deleteRecord: (id: string) =>
    client.delete<ApiResponse<null>>(`/platform/records/${id}`),
};

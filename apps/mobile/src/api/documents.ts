import apiClient from './client';
import type { WorkerDocumentDetail, WorkerDocumentsSummary } from '../types';

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: string;
}

// The worker's own VERGO Ops documents: the Key Information Document, the
// employment agreement and assignment confirmations. Agreeing here is the
// same act as agreeing through the emailed secure link.
export const documentsApi = {
  async getSummary(): Promise<WorkerDocumentsSummary> {
    const response = await apiClient.get<ApiEnvelope<WorkerDocumentsSummary>>('/api/v1/mobile/documents');
    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Failed to load your documents');
    }
    return response.data.data;
  },

  async getDocument(documentId: string): Promise<WorkerDocumentDetail> {
    const response = await apiClient.get<ApiEnvelope<WorkerDocumentDetail>>(`/api/v1/mobile/documents/${documentId}`);
    if (!response.data.ok || !response.data.data) {
      throw new Error(response.data.error || 'Document not found');
    }
    return response.data.data;
  },

  async acknowledgeKid(documentId: string): Promise<void> {
    const response = await apiClient.post<ApiEnvelope<never>>(
      `/api/v1/mobile/documents/kid/${documentId}/acknowledge`,
      { acknowledged: true }
    );
    if (!response.data.ok) throw new Error(response.data.error || 'Could not record that');
  },

  async acceptAgreement(documentId: string, typedName: string): Promise<void> {
    const response = await apiClient.post<ApiEnvelope<never>>(
      `/api/v1/mobile/documents/agreement/${documentId}/accept`,
      { agree: true, typedName }
    );
    if (!response.data.ok) throw new Error(response.data.error || 'Could not record your agreement');
  },
};

export default documentsApi;

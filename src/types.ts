export type NavSection =
  | 'overview'
  | 'new-analysis'
  | 'history'
  | 'profile'
  | 'settings';

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  institution: string;
  department: string;
  role: string;
  authProvider: 'supabase' | 'local-session';
  createdAt: string;
}

export interface AnalysisRecord {
  id: string;
  userId: string;
  fileName: string;
  fileSizeBytes: number;
  imagePreviewUrl?: string;
  predictedClass: string;
  confidence?: number | null;
  classProbabilities?: Record<string, number> | null;
  modelVersion?: string;
  experimental?: boolean;
  status: 'Completed' | 'Failed';
  timestamp: string;
  savedReport: boolean;
  notes?: string;
}

export interface BackendConnectionState {
  checked: boolean;
  checking: boolean;
  connected: boolean;
  modelLoaded?: boolean;
  modelVersion?: string;
  modelError?: string;
  endpoint: string;
  latencyMs?: number;
  message: string;
  formFieldName: 'file' | 'image';
  useDirectClientFetch: boolean;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

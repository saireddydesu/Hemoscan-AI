import { isSupabaseConfigured, supabase } from './supabaseClient';
import type { UserProfile } from '../types';

const LOCAL_ACCOUNTS_KEY = 'hemoscan_local_accounts_v1';
const LOCAL_ACTIVE_SESSION_KEY = 'hemoscan_active_session_v1';

interface StoredLocalAccount {
  id: string;
  email: string;
  passwordSalt: string;
  passwordHashHex: string;
  fullName: string;
  institution: string;
  department: string;
  role: string;
  createdAt: string;
}

/**
 * Computes a salted SHA-256 hex digest using Web Crypto API so local fallback
 * workspace accounts never store plaintext passwords in storage.
 */
async function hashPasswordWithSalt(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${salt}::hemoscan::${password}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function generateRandomHex(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function readLocalAccounts(): StoredLocalAccount[] {
  try {
    const raw = localStorage.getItem(LOCAL_ACCOUNTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalAccounts(accounts: StoredLocalAccount[]): void {
  localStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function deriveNameFromEmail(email: string): string {
  const prefix = email.split('@')[0] || 'Researcher';
  return prefix
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function getCurrentSessionUser(): Promise<UserProfile | null> {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const meta = data.user.user_metadata || {};
    return {
      id: data.user.id,
      email: data.user.email || '',
      fullName: (meta.full_name as string) || deriveNameFromEmail(data.user.email || ''),
      institution: (meta.institution as string) || 'Biomedical Engineering Department',
      department: (meta.department as string) || 'Hematology & Pattern Recognition Lab',
      role: (meta.role as string) || 'Student Researcher',
      authProvider: 'supabase',
      createdAt: data.user.created_at || new Date().toISOString(),
    };
  }

  // Check sessionStorage first, then localStorage ("Remember me")
  const rawSession =
    sessionStorage.getItem(LOCAL_ACTIVE_SESSION_KEY) ||
    localStorage.getItem(LOCAL_ACTIVE_SESSION_KEY);
  if (!rawSession) return null;

  try {
    const parsed = JSON.parse(rawSession) as UserProfile;
    if (parsed && parsed.id && parsed.email) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export async function signInUser(params: {
  email: string;
  password: string;
  rememberMe: boolean;
}): Promise<UserProfile> {
  const normalizedEmail = params.email.trim().toLowerCase();

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password: params.password,
    });
    if (error || !data.user) {
      throw new Error(error?.message || 'Unable to sign in with those credentials.');
    }
    const meta = data.user.user_metadata || {};
    return {
      id: data.user.id,
      email: data.user.email || normalizedEmail,
      fullName: (meta.full_name as string) || deriveNameFromEmail(normalizedEmail),
      institution: (meta.institution as string) || 'Biomedical Engineering Department',
      department: (meta.department as string) || 'Hematology & Pattern Recognition Lab',
      role: (meta.role as string) || 'Student Researcher',
      authProvider: 'supabase',
      createdAt: data.user.created_at || new Date().toISOString(),
    };
  }

  // Local workspace authentication layer (salted SHA-256 verification)
  const accounts = readLocalAccounts();
  const existing = accounts.find((acc) => acc.email === normalizedEmail);

  if (!existing) {
    throw new Error(
      'No workspace account found for this email. Select "Create Account" below to register.'
    );
  }

  const candidateHash = await hashPasswordWithSalt(params.password, existing.passwordSalt);
  if (candidateHash !== existing.passwordHashHex) {
    throw new Error('Incorrect password. Please verify your credentials and try again.');
  }

  const profile: UserProfile = {
    id: existing.id,
    email: existing.email,
    fullName: existing.fullName,
    institution: existing.institution,
    department: existing.department,
    role: existing.role,
    authProvider: 'local-session',
    createdAt: existing.createdAt,
  };

  persistLocalSession(profile, params.rememberMe);
  return profile;
}

export async function registerUser(params: {
  fullName: string;
  email: string;
  password: string;
  institution?: string;
  rememberMe: boolean;
}): Promise<UserProfile> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const cleanName = params.fullName.trim() || deriveNameFromEmail(normalizedEmail);
  const cleanInstitution =
    params.institution?.trim() || 'Department of Computer Science & Bio-AI';

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: params.password,
      options: {
        data: {
          full_name: cleanName,
          institution: cleanInstitution,
          department: 'Dermatoglyphics & Hematology Research',
          role: 'Research Investigator',
        },
      },
    });
    if (error || !data.user) {
      throw new Error(error?.message || 'Registration failed. Please check your details.');
    }
    return {
      id: data.user.id,
      email: data.user.email || normalizedEmail,
      fullName: cleanName,
      institution: cleanInstitution,
      department: 'Dermatoglyphics & Hematology Research',
      role: 'Research Investigator',
      authProvider: 'supabase',
      createdAt: data.user.created_at || new Date().toISOString(),
    };
  }

  const accounts = readLocalAccounts();
  if (accounts.some((acc) => acc.email === normalizedEmail)) {
    throw new Error('An account with this email already exists. Please sign in instead.');
  }

  const salt = generateRandomHex(16);
  const passwordHashHex = await hashPasswordWithSalt(params.password, salt);

  const newAccount: StoredLocalAccount = {
    id: `usr_${generateRandomHex(8)}`,
    email: normalizedEmail,
    passwordSalt: salt,
    passwordHashHex,
    fullName: cleanName,
    institution: cleanInstitution,
    department: 'Dermatoglyphics & Hematology Research',
    role: 'Research Investigator',
    createdAt: new Date().toISOString(),
  };

  writeLocalAccounts([...accounts, newAccount]);

  const profile: UserProfile = {
    id: newAccount.id,
    email: newAccount.email,
    fullName: newAccount.fullName,
    institution: newAccount.institution,
    department: newAccount.department,
    role: newAccount.role,
    authProvider: 'local-session',
    createdAt: newAccount.createdAt,
  };

  persistLocalSession(profile, params.rememberMe);
  return profile;
}

export async function requestPasswordReset(email: string): Promise<string> {
  const normalizedEmail = email.trim().toLowerCase();
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: window.location.origin,
    });
    if (error) {
      throw new Error(error.message);
    }
    return `Password recovery link dispatched to ${normalizedEmail}.`;
  }

  const accounts = readLocalAccounts();
  const exists = accounts.some((acc) => acc.email === normalizedEmail);
  if (!exists) {
    throw new Error(
      'No local workspace profile matches this email. Configure Supabase Auth for email recovery or register a new account.'
    );
  }
  return 'Supabase Auth is not configured for SMTP email dispatch. Connect VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY to enable password reset emails.';
}

export async function updateUserProfile(
  current: UserProfile,
  updates: Pick<UserProfile, 'fullName' | 'institution' | 'department' | 'role'>
): Promise<UserProfile> {
  if (isSupabaseConfigured && supabase) {
    const { error } = await supabase.auth.updateUser({
      data: {
        full_name: updates.fullName,
        institution: updates.institution,
        department: updates.department,
        role: updates.role,
      },
    });
    if (error) {
      throw new Error(error.message);
    }
  } else {
    const accounts = readLocalAccounts();
    const updatedAccounts = accounts.map((acc) =>
      acc.id === current.id
        ? {
            ...acc,
            fullName: updates.fullName,
            institution: updates.institution,
            department: updates.department,
            role: updates.role,
          }
        : acc
    );
    writeLocalAccounts(updatedAccounts);
  }

  const updatedProfile: UserProfile = {
    ...current,
    ...updates,
  };

  if (localStorage.getItem(LOCAL_ACTIVE_SESSION_KEY)) {
    localStorage.setItem(LOCAL_ACTIVE_SESSION_KEY, JSON.stringify(updatedProfile));
  }
  if (sessionStorage.getItem(LOCAL_ACTIVE_SESSION_KEY)) {
    sessionStorage.setItem(LOCAL_ACTIVE_SESSION_KEY, JSON.stringify(updatedProfile));
  }

  return updatedProfile;
}

export async function signOutUser(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    await supabase.auth.signOut();
  }
  localStorage.removeItem(LOCAL_ACTIVE_SESSION_KEY);
  sessionStorage.removeItem(LOCAL_ACTIVE_SESSION_KEY);
}

function persistLocalSession(profile: UserProfile, rememberMe: boolean): void {
  const serialized = JSON.stringify(profile);
  if (rememberMe) {
    localStorage.setItem(LOCAL_ACTIVE_SESSION_KEY, serialized);
    sessionStorage.removeItem(LOCAL_ACTIVE_SESSION_KEY);
  } else {
    sessionStorage.setItem(LOCAL_ACTIVE_SESSION_KEY, serialized);
    localStorage.removeItem(LOCAL_ACTIVE_SESSION_KEY);
  }
}

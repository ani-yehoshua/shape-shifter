// Account-management + support calls that hit the website's Next.js API
// routes (../../app/api/*). Ports of deleteAccount/updateEmail in
// ../../lib/API.ts, but against the deployed site's absolute URL
// (EXPO_PUBLIC_SITE_URL -- the website's NEXT_PUBLIC_SITE_URL) and
// authenticating with the Supabase access token as a Bearer header, which
// the routes already accept.
import { supabase } from './supabase';

export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function apiUrl(path: string) {
    const base = process.env.EXPO_PUBLIC_SITE_URL;
    if (!base) throw new Error('EXPO_PUBLIC_SITE_URL is not set');
    return `${base.replace(/\/+$/, '')}${path}`;
}

async function accessToken() {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error('No active session');
    return data.session.access_token;
}

export async function updateEmail(newEmail: string): Promise<void> {
    const res = await fetch(apiUrl('/api/update-email'), {
        method: 'PUT',
        headers: {
            Authorization: `Bearer ${await accessToken()}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: newEmail }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || 'Failed to update your email');
    }
}

export async function deleteAccount(): Promise<void> {
    const res = await fetch(apiUrl('/api/delete-account'), {
        method: 'DELETE',
        headers: {
            Authorization: `Bearer ${await accessToken()}`,
            'Content-Type': 'application/json',
        },
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.details || 'Failed to delete your account');
    }
}

export type FeedbackFile = { uri: string; name: string; type: string };

// Same multipart body as the website's SubmitFeedback: email, message, and
// zero or more "files" parts (React Native's FormData takes {uri,name,type}).
export async function submitFeedback(
    email: string,
    message: string,
    files: FeedbackFile[] = [],
): Promise<boolean> {
    const formData = new FormData();
    formData.append('email', email);
    formData.append('message', message);
    files.forEach((f) => formData.append('files', f as unknown as Blob));
    const res = await fetch(apiUrl('/api/report-issue'), { method: 'POST', body: formData });
    const result = await res.json().catch(() => ({}));
    return !!result.success;
}

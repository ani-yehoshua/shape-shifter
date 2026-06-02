"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/lib/contexts/AuthContext";

export default function SubmitFeedback({ className }: { className?: string }) {
    const { user } = useAuth();
    const [open, setOpen] = React.useState(false);
    const [email, setEmail] = React.useState("");
    const [message, setMessage] = React.useState("");
    const [files, setFiles] = React.useState<File[]>([]);
    const [loading, setLoading] = React.useState(false);
    const [alert, setAlert] = React.useState<{
        msg: string;
        ok: boolean;
    } | null>(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFiles(Array.from(e.target.files ?? []));
    };

    const removeFile = (name: string, lastModified: number) => {
        setFiles(prev =>
            prev.filter(
                f => !(f.name === name && f.lastModified === lastModified),
            ),
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email || !emailRegex.test(email)) {
            setAlert({ msg: "Please enter a valid email address.", ok: false });
            return;
        }
        if (!message.trim()) {
            setAlert({ msg: "Please provide a description.", ok: false });
            return;
        }
        setLoading(true);
        setAlert(null);

        const formData = new FormData();
        formData.append("email", email);
        formData.append("message", message);
        files.forEach(f => formData.append("files", f));

        try {
            const res = await fetch("/api/report-issue", {
                method: "POST",
                body: formData,
            });
            const result = await res.json();
            if (result.success) {
                setAlert({
                    msg: "Feedback submitted! Check your spam folder for confirmation.",
                    ok: true,
                });
                setEmail("");
                setMessage("");
                setFiles([]);
                await new Promise(r => setTimeout(r, 2500));
                setOpen(false);
                setAlert(null);
            } else {
                setAlert({
                    msg: "Something went wrong. Please try again.",
                    ok: false,
                });
            }
        } catch {
            setAlert({
                msg: "An error occurred. Please try again.",
                ok: false,
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <button
                onClick={() => {
                    setEmail(user?.email ?? "");
                    setOpen(true);
                }}
                className={`relative text-sm font-semibold underline-offset-4 hover:underline transition-all ${className ?? "text-ink"}`}>
                Submit Feedback
            </button>

            {open &&
                createPortal(
                    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4'>
                        <div className='w-full max-w-md bg-sand-4 rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col'>
                            {/* Header */}
                            <div className='border-b border-ink/30 px-6 py-4 shrink-0'>
                                <h2 className='text-xl font-bold text-sand-1 text-center'>
                                    Submit feedback
                                </h2>
                            </div>

                            {/* Body */}
                            <form
                                onSubmit={handleSubmit}
                                className='px-6 py-5 flex flex-col gap-4 overflow-y-auto'>
                                {/* Email */}
                                <div className='flex flex-col gap-1'>
                                    <label className='text-xs font-semibold text-sand-1/80'>
                                        Your email
                                    </label>
                                    <input
                                        className='w-full bg-sand-1/10 border border-sand-1/30 rounded-lg px-3 py-2 text-sm text-sand-1 placeholder-sand-1/40 outline-none focus:border-sand-1 transition-colors'
                                        onChange={e => {
                                            setEmail(e.target.value);
                                            setAlert(null);
                                        }}
                                        placeholder='you@example.com'
                                        type='email'
                                        value={email}
                                    />
                                </div>

                                {/* Message */}
                                <div className='flex flex-col gap-1'>
                                    <label className='text-xs font-semibold text-sand-1/80'>
                                        Description
                                    </label>
                                    <textarea
                                        className='w-full bg-sand-1/10 border border-sand-1/30 rounded-lg px-3 py-2 text-sm text-sand-1 placeholder-sand-1/40 outline-none focus:border-sand-1 transition-colors resize-none'
                                        onChange={e => {
                                            setMessage(e.target.value);
                                            setAlert(null);
                                        }}
                                        placeholder='Describe the issue or feedback…'
                                        rows={5}
                                        value={message}
                                    />
                                </div>

                                {/* File upload */}
                                <div className='flex flex-col gap-2'>
                                    <span className='text-xs font-semibold text-sand-1/80'>
                                        Screenshot (optional)
                                    </span>
                                    <label className='cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-ink text-sand-1 text-sm font-semibold hover:opacity-90 transition-opacity w-fit'>
                                        <svg
                                            className='w-4 h-4'
                                            fill='none'
                                            stroke='currentColor'
                                            viewBox='0 0 24 24'>
                                            <path
                                                strokeLinecap='round'
                                                strokeLinejoin='round'
                                                strokeWidth={2}
                                                d='M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12'
                                            />
                                        </svg>
                                        Upload files
                                        <input
                                            type='file'
                                            multiple
                                            onChange={handleFileChange}
                                            className='sr-only'
                                        />
                                    </label>

                                    {files.length > 0 && (
                                        <ul className='flex flex-col gap-1'>
                                            {files.map(f => (
                                                <li
                                                    key={`${f.name}-${f.lastModified}`}
                                                    className='flex items-center gap-2 text-xs text-sand-1/80'>
                                                    <span className='truncate'>
                                                        {f.name}
                                                    </span>
                                                    <button
                                                        type='button'
                                                        onClick={() =>
                                                            removeFile(
                                                                f.name,
                                                                f.lastModified,
                                                            )
                                                        }
                                                        className='ml-auto text-ink/50 hover:text-red-600 transition-colors'>
                                                        ✕
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>

                                {alert && (
                                    <div
                                        className={`rounded-lg px-3 py-2 text-sm font-semibold ${alert.ok ? "bg-green/20 text-green border border-green/40" : "bg-red-100 text-red-700 border border-red-300"}`}>
                                        {alert.msg}
                                    </div>
                                )}
                            </form>

                            {/* Footer */}
                            <div className='flex justify-end gap-3 px-6 pb-5 shrink-0'>
                                <button
                                    type='button'
                                    onClick={() => {
                                        setOpen(false);
                                        setAlert(null);
                                    }}
                                    className='px-5 py-2 rounded-full border border-red-500 text-red-500 text-sm font-semibold hover:bg-red-500 hover:text-sand-1 transition-all'>
                                    Cancel
                                </button>
                                <button
                                    disabled={loading}
                                    onClick={handleSubmit}
                                    className='px-5 py-2 rounded-full text-ink bg-sand-1 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-colors'>
                                    {loading ? "Submitting…" : "Submit"}
                                </button>
                            </div>
                        </div>
                    </div>,
                    document.body,
                )}
        </>
    );
}

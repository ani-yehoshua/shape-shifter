"use client";

import * as React from "react";

type Props = {
    autoComplete?: string;
    endAdornment?: React.ReactNode;
    error?: boolean;
    helperText?: string;
    label: string;
    minRows?: number;
    multiline?: boolean;
    name?: string;
    onBlur?: React.FocusEventHandler;
    onChange?: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
    required?: boolean;
    startAdornment?: React.ReactNode;
    type?: string;
    value?: string;
};

export default function FormFields({
    autoComplete,
    endAdornment,
    error,
    helperText,
    label,
    minRows = 3,
    multiline,
    name,
    onBlur,
    onChange,
    required,
    startAdornment,
    type = "text",
    value,
}: Props) {
    const id = `field-${label.toLowerCase().replace(/\s+/g, "-")}`;

    const inputBase =
        "flex-1 bg-transparent text-sand-1 placeholder-sand-1/40 text-sm py-2 px-1 outline-none min-w-0";

    const wrapperBase = `
    flex items-center border-b-2 transition-colors duration-150
    ${error ? "border-red-600" : "border-sand-1/40 focus-within:border-sand-1"}
  `;

    return (
        <div className='flex flex-col gap-1 w-full'>
            <label
                htmlFor={id}
                className='text-xs font-semibold text-sand-1/80 leading-tight'>
                {label}
                {required && <span className='text-red-400 ml-0.5'>*</span>}
            </label>

            <div className={wrapperBase}>
                {startAdornment && (
                    <div className='flex items-center pr-2 text-sand-1/70 shrink-0'>
                        {startAdornment}
                    </div>
                )}

                {multiline ? (
                    <textarea
                        id={id}
                        autoComplete={autoComplete}
                        className={`${inputBase} resize-none`}
                        onBlur={onBlur}
                        onChange={
                            onChange as React.ChangeEventHandler<HTMLTextAreaElement>
                        }
                        required={required}
                        rows={minRows}
                        value={value}
                    />
                ) : (
                    <input
                        id={id}
                        autoComplete={autoComplete}
                        className={inputBase}
                        name={name}
                        onBlur={onBlur}
                        onChange={
                            onChange as React.ChangeEventHandler<HTMLInputElement>
                        }
                        required={required}
                        type={type}
                        value={value}
                    />
                )}

                {endAdornment && (
                    <div className='flex items-center pl-1 text-sand-1/70 shrink-0'>
                        {endAdornment}
                    </div>
                )}
            </div>

            {helperText && (
                <p
                    className={`text-xs mt-0.5 ${error ? "text-red-500" : "text-ink/60"}`}>
                    {helperText}
                </p>
            )}
        </div>
    );
}

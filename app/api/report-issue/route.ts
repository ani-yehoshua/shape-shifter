import { Resend } from 'resend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getResend() {
    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    const to = process.env.RESEND_TO;
    if (!key || !from || !to) throw new Error('Resend env vars are not set');
    return { resend: new Resend(key), from, to };
}

export async function POST(req: Request) {
    const { resend, from, to } = getResend();

    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
        return new Response(
            JSON.stringify({
                success: false,
                error: 'Expected multipart/form-data',
            }),
            { status: 400 },
        );
    }

    const body = await req.formData();
    const email = body.get('email') || 'unknown@user';
    const message = body.get('message') || '';
    const files = body.getAll('files') as File[];

    const attachments = await Promise.all(
        files.map(async file => {
            const buffer = Buffer.from(await file.arrayBuffer());
            return {
                filename: file.name,
                content: buffer,
            };
        }),
    );

    try {
        const { data, error } = await resend.emails.send({
            from,
            to: [to],
            subject: '🛠️ New Issue Reported',
            text: `From: ${email}\n\nMessage:\n${message}`,
            ...(attachments.length ? { attachments } : {}),
        });

        if (error) throw error;

        return new Response(JSON.stringify({ success: true, data }), {
            status: 200,
        });
    } catch (error: any) {
        console.error('Resend error:', error);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500 },
        );
    }
}

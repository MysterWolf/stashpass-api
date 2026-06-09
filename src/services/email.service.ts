import { Resend } from 'resend';

// Resend client and FROM are read at call time, not module load time.
// Instantiating Resend with an undefined key throws immediately, which would
// crash the server before app.listen() if done at the top level.
export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY);
  const from   = process.env.FROM_EMAIL ?? 'noreply@stashpass.app';

  const { error } = await resend.emails.send({
    from,
    to,
    subject: `Your StashPass code: ${otp}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <p style="font-size:14px;color:#8A7A6A;margin:0 0 24px">StashPass</p>
        <h1 style="font-size:28px;font-weight:600;color:#2C1F0E;margin:0 0 8px;letter-spacing:-0.5px">
          Your sign-in code
        </h1>
        <p style="font-size:15px;color:#8A7A6A;margin:0 0 32px">
          Enter this code to connect your StashPass wallet.
          It expires in 10 minutes.
        </p>
        <div style="background:#F2EDE4;border-radius:10px;padding:24px;text-align:center;margin-bottom:32px">
          <span style="font-size:40px;font-weight:700;letter-spacing:10px;color:#2C1F0E">
            ${otp}
          </span>
        </div>
        <p style="font-size:13px;color:#B8A898;margin:0">
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    throw new Error(`Resend delivery failed: ${error.message}`);
  }
}

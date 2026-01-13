import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();

    if (userError) {
      throw userError;
    }

    const user = userData.users.find(u => u.email === email);
    const code = Math.floor(1000 + Math.random() * 9000).toString();

    if (!user) {
      return new Response(
        JSON.stringify({
          message: 'If an account exists, a reset code has been sent',
          debugCode: code
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await supabase
      .from('password_reset_codes')
      .update({ used: true })
      .eq('email', email)
      .eq('used', false);

    const { error: insertError } = await supabase
      .from('password_reset_codes')
      .insert({
        user_id: user.id,
        email,
        code,
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      throw insertError;
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Password Reset Code</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f6f9fc;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f6f9fc; padding: 40px 0;">
            <tr>
              <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                  <tr>
                    <td style="padding: 40px;">
                      <h1 style="margin: 0 0 24px 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Password Reset Code</h1>
                      <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 24px; color: #4a5568;">You requested a password reset. Use the code below to reset your password:</p>
                      <div style="background-color: #f7fafc; border: 2px solid #e2e8f0; border-radius: 8px; padding: 24px; text-align: center; margin: 24px 0;">
                        <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2d3748; font-family: 'Courier New', monospace;">${code}</div>
                      </div>
                      <p style="margin: 0 0 16px 0; font-size: 14px; line-height: 20px; color: #718096;">This code will expire in 10 minutes.</p>
                      <p style="margin: 0; font-size: 14px; line-height: 20px; color: #718096;">If you didn't request this code, you can safely ignore this email.</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 24px 40px; background-color: #f7fafc; border-top: 1px solid #e2e8f0; border-radius: 0 0 8px 8px;">
                      <p style="margin: 0; font-size: 12px; line-height: 16px; color: #a0aec0; text-align: center;">This is an automated message, please do not reply.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    console.log('Attempting to send email to:', email);
    console.log('Using from address: avo@avoreid.com');
    console.log('Reset code:', code);

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'avo@avoreid.com',
        to: email,
        subject: 'Your Password Reset Code',
        html: emailHtml,
      }),
    });

    const emailResult = await emailResponse.json();

    console.log('Resend API response status:', emailResponse.status);
    console.log('Resend API response body:', JSON.stringify(emailResult));

    if (!emailResponse.ok) {
      console.error('Resend API error - Full details:', {
        status: emailResponse.status,
        statusText: emailResponse.statusText,
        body: emailResult
      });

      return new Response(
        JSON.stringify({
          error: `Email delivery failed: ${emailResult.message || JSON.stringify(emailResult)}`,
          details: emailResult,
          resetCode: code
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('Email sent successfully. Resend ID:', emailResult.id);
    console.log('='.repeat(50));
    console.log('PASSWORD RESET CODE:', code);
    console.log('FOR EMAIL:', email);
    console.log('EXPIRES AT:', expiresAt.toISOString());
    console.log('='.repeat(50));

    return new Response(
      JSON.stringify({
        message: 'Reset code sent to your email',
        debugCode: code
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

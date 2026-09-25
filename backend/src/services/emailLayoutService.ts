// No remote images or web fonts: this must remain legible with image loading off,
// in mail clients without custom fonts, and while the app is IP-restricted.
export const escapeEmailHtml = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const emailButtonStyle = "display:inline-block;background:#00ed45;color:#101010!important;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:600;line-height:24px;padding:17px 24px;border-radius:0;max-width:100%;box-sizing:border-box;text-align:center;";

export function renderEmailLayout(input: {subject: string; bodyHtml: string; replyTo: string}): string {
  const title = escapeEmailHtml(input.subject);
  const mailbox = input.replyTo.match(/<?([^<>\s]+@[^<>\s]+)>?$/)?.[1] ?? "lopezb.jl@gmail.com";
  const contact = escapeEmailHtml(mailbox);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="light dark"/><meta name="supported-color-schemes" content="light dark"/>
<title>${title}</title>
<style>
  .darci-content p{margin:0 0 22px}.darci-content p:last-child{margin-bottom:0}
  .darci-content a{color:inherit;overflow-wrap:anywhere;word-break:break-word}
  .darci-content ul,.darci-content ol{padding-left:22px;margin:0 0 22px}
  .darci-content li{margin:8px 0}.darci-content strong{font-weight:600}
  .darci-content .darci-cta-row{margin:28px 0}
  @media only screen and (max-width:620px){.darci-outer{padding:16px 12px!important}.darci-pad{padding-left:24px!important;padding-right:24px!important}.darci-title{font-size:32px!important;line-height:36px!important}.darci-button{display:block!important}.darci-contact-btn{display:block!important;width:100%!important;box-sizing:border-box;margin-bottom:10px!important;padding-right:0!important}.darci-contact-btn td{display:block!important;width:100%!important}}
  @media(prefers-color-scheme:dark){.darci-background{background:#151515!important}.darci-card{background:#222222!important}.darci-ink{color:#f5f5f5!important}.darci-muted{color:#c4c4c4!important}.darci-divider{border-color:#424242!important}.darci-brand{background:#00ed45!important;color:#101010!important}}
</style></head>
<body class="darci-background" style="margin:0;padding:0;background:#f0f0ed;font-family:Arial,Helvetica,sans-serif;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${title}. Open DARCi to continue securely.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="darci-background" style="background:#f0f0ed;">
<tr><td class="darci-outer" align="center" style="padding:40px 16px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" class="darci-card" style="max-width:600px;background:#ffffff;">
<tr><td class="darci-brand darci-pad" style="padding:24px 40px;background:#00ed45;color:#101010;font-size:28px;line-height:32px;font-weight:400;">DARCi<span style="font-size:14px;">&nbsp;↗</span></td></tr>
<tr><td class="darci-pad" style="padding:40px 40px 0;">
<p class="darci-muted" style="margin:0 0 18px;font-family:'Courier New',monospace;font-size:11px;line-height:16px;color:#666666;">YOUR DARCi UPDATE</p>
<h1 class="darci-title darci-ink" style="margin:0;color:#101010;font-size:38px;line-height:42px;font-weight:400;">${title}</h1>
</td></tr>
<tr><td class="darci-pad darci-ink darci-content" style="padding:30px 40px 40px;color:#343434;font-size:16px;line-height:26px;font-weight:400;overflow-wrap:anywhere;">${input.bodyHtml}</td></tr>
<tr><td class="darci-pad darci-divider" style="padding:24px 40px 30px;border-top:1px solid #e5e5e0;">
<p class="darci-muted" style="margin:0 0 8px;color:#666666;font-size:13px;line-height:21px;">Need a hand? Reply to this email or <a href="mailto:${contact}" style="color:inherit;text-decoration:underline;">contact us</a>.</p>
<p class="darci-muted" style="margin:0;color:#666666;font-size:12px;line-height:20px;">DARCi · Document signing &amp; in-person notarization</p>
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
}

const REMETENTE = 'Unnify Conecta <noreply@unnifyconecta.com.br>';

export function escaparHtml(valor: string) {
  return valor
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function modeloEmail({
  titulo,
  saudacao,
  texto,
  botao,
  link,
  rodape,
}: {
  titulo: string;
  saudacao: string;
  texto: string;
  botao: string;
  link: string;
  rodape: string;
}) {
  return `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px;color:#111">
  <h1 style="font-size:24px;margin:0 0 16px">${escaparHtml(titulo)}</h1>
  <p style="font-size:15px;line-height:1.5">${escaparHtml(saudacao)}</p>
  <p style="font-size:15px;line-height:1.5">${escaparHtml(texto)}</p>
  <p style="margin:28px 0">
    <a href="${link}" style="background:#ea580c;color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:bold;display:inline-block">${escaparHtml(botao)}</a>
  </p>
  <p style="font-size:13px;color:#555;line-height:1.5">${escaparHtml(rodape)}</p>
</div>`;
}

// Envia pelo Resend (domínio verificado). Retorna false em falha, sem lançar.
export async function enviarEmail({ para, assunto, html }: { para: string; assunto: string; html: string }) {
  const resposta = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: REMETENTE, to: para, subject: assunto, html }),
  });
  if (!resposta.ok) {
    console.error('Falha ao enviar e-mail:', resposta.status);
  }
  return resposta.ok;
}

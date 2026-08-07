import { NextResponse } from "next/server";
import { crearClienteAdmin } from "@/lib/supabase/admin";
import { despachar, type EnviarEmail } from "@/lib/notificaciones/despachar";

export const maxDuration = 60;

const enviarConResend: EnviarEmail = async ({ from, to, subject, text }) => {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (res.ok) return { ok: true };
  const cuerpo = await res.text();
  return { ok: false, error: `Resend ${res.status}: ${cuerpo.slice(0, 300)}` };
};

export async function POST(request: Request) {
  const auth = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  const from = process.env.EMAIL_FROM;
  if (!from) return NextResponse.json({ error: "falta EMAIL_FROM" }, { status: 500 });

  const resumen = await despachar(crearClienteAdmin(), enviarConResend, from);
  return NextResponse.json(resumen);
}

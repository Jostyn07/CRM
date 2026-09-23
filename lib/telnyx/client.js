import { TelnyxRTC } from '@telnyx/webrtc';
import { supabase } from '../supabase/client';

// Un solo cliente conectado por sesión de navegador -- no uno por
// llamada. Colocar llamadas sucesivas reutiliza esta misma conexión.
let client = null;
let connectPromise = null;

async function fetchToken() {
  const { data, error } = await supabase.functions.invoke('telnyx-get-token');

  if (error) {
    // El mensaje genérico de Supabase ("Edge Function returned a
    // non-2xx status code") no dice el motivo real -- el cuerpo con el
    // mensaje específico de nuestra función viene en error.context, no
    // en error.message. Lo extraemos a mano.
    let detail = error.message;
    try {
      const body = await error.context.json();
      if (body?.error) detail = body.error;
    } catch {
      // Si el cuerpo no se puede leer como JSON, nos quedamos con el
      // mensaje genérico -- mejor eso que romper aquí.
    }
    throw new Error(detail);
  }

  if (data?.error) throw new Error(data.error);
  return data.token;
}

export async function getTelnyxClient() {
  if (client) return client;
  if (connectPromise) return connectPromise;

  connectPromise = (async () => {
    const token = await fetchToken();

    const rtc = new TelnyxRTC({ login_token: token });

    // Elemento <audio> donde se reproduce la voz remota -- lo crea
    // CallInProgress antes de llamar a getTelnyxClient().
    rtc.remoteElement = 'telnyx-remote-audio';

    await new Promise((resolve, reject) => {
      rtc.on('telnyx.ready', () => resolve());
      rtc.on('telnyx.error', (err) => reject(err instanceof Error ? err : new Error('Error al conectar con Telnyx.')));
      rtc.connect();
    });

    client = rtc;
    return rtc;
  })();

  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

export function disconnectTelnyx() {
  if (client) {
    client.disconnect();
    client = null;
  }
}
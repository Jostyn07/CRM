// Ruta: lib/calls/pbx.js
// Telefonía 3CX (junto a Telnyx): ajustes, clic para llamar y plantilla CRM.

import { supabase } from '../supabase/client';

export const MODES = {
  telnyx: 'Telnyx (navegador)',
  '3cx': '3CX (su extensión)',
  choose: 'El usuario elige en cada llamada',
};

async function rpc(name, params) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw new Error(error.message);
  return data;
}

export const getMyCallSettings = () => rpc('pbx_my_call_settings');
export const getPbxStatus = () => rpc('pbx_integration_status');
export const listUserCallSettings = () => rpc('pbx_list_user_settings');
export const setUserCallSetting = (userId, mode, extension) =>
  rpc('pbx_set_user_setting', { p_user: userId, p_mode: mode || null, p_extension: extension || null });

export function savePbx({ baseUrl, defaultBranchId, defaultMode, clientId, clientSecret, rotateKey = false, active = true }) {
  return rpc('pbx_save_integration', {
    p_base_url: baseUrl,
    p_default_branch: defaultBranchId || null,
    p_default_mode: defaultMode,
    p_client_id: clientId ?? null,
    p_client_secret: clientSecret === undefined ? null : clientSecret,
    p_rotate_key: rotateKey,
    p_active: active,
  });
}

async function invoke(body) {
  const { data, error } = await supabase.functions.invoke('pbx-3cx-call', { body });
  if (error) {
    let msg = error.message;
    let extra = {};
    try {
      extra = await error.context.json();
      msg = extra.error || msg;
    } catch {}
    const e = new Error(msg);
    e.fallback = extra.fallback;
    e.to = extra.to;
    throw e;
  }
  return data;
}

export const testPbx = () => invoke({ action: 'test' });

// Clic para llamar por 3CX.
// click_mode 'api' → la central marca desde la extensión (suena primero el teléfono del asesor).
// click_mode 'tel' → se abre la app de 3CX con el número (enlace tel:).
export async function callVia3cx({ to, leadId, clickMode }) {
  if (clickMode === 'api') {
    try {
      return { mode: 'api', ...(await invoke({ action: 'call', to, lead_id: leadId })) };
    } catch (e) {
      if (e.fallback === 'tel' && e.to) {
        openTel(e.to);
        return { mode: 'tel', to: e.to, warning: e.message };
      }
      throw e;
    }
  }
  if (!to) throw new Error('El lead no tiene teléfono');
  openTel(to);
  return { mode: 'tel', to };
}

function openTel(number) {
  const clean = String(number).replace(/[^\d+]/g, '');
  window.location.href = `tel:${clean}`;
}

// ---------------- Plantilla CRM para 3CX (Integraciones → CRM → Agregar plantilla)
export function functionUrl() {
  return `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, '')}/functions/v1/pbx-3cx`;
}

export function buildTemplateXml(key, name = 'LeadForce') {
  const base = functionUrl();
  const u = (q) => `${base}?${q}&amp;key=[ApiKey]`;
  const contactVars = (prefix) => `
        <Variable Name="ContactID" Path="${prefix}id"><Filter /></Variable>
        <Variable Name="FirstName" Path="${prefix}first_name"><Filter /></Variable>
        <Variable Name="LastName" Path="${prefix}last_name"><Filter /></Variable>
        <Variable Name="CompanyName" Path="${prefix}company"><Filter /></Variable>
        <Variable Name="Email" Path="${prefix}email"><Filter /></Variable>
        <Variable Name="PhoneBusiness" Path="${prefix}phone"><Filter /></Variable>
        <Variable Name="ContactUrl" Path="${prefix}url"><Filter /></Variable>`;
  const outputs = `
      <Outputs AllowEmpty="false">
        <Output Type="ContactID" Passes="0" Value="[ContactID]" />
        <Output Type="FirstName" Passes="0" Value="[FirstName]" />
        <Output Type="LastName" Passes="0" Value="[LastName]" />
        <Output Type="CompanyName" Passes="0" Value="[CompanyName]" />
        <Output Type="Email" Passes="0" Value="[Email]" />
        <Output Type="PhoneBusiness" Passes="0" Value="[PhoneBusiness]" />
        <Output Type="ContactUrl" Passes="0" Value="[ContactUrl]" />
        <Output Type="EntityType" Passes="0" Value="Contacts" />
        <Output Type="EntityId" Passes="0" Value="[ContactID]" />
      </Outputs>`;
  return `<?xml version="1.0"?>
<Crm Country="US" Name="${name}" Version="1" SupportsEmojis="true">
  <Number Prefix="AsIs" MaxLength="[MaxLength]" />
  <Connection MaxConcurrentRequests="8" />
  <Parameters>
    <Parameter Name="ApiKey" Type="Password" Parent="General Configuration" Editor="String" Title="Clave de ${name}:" Default="${key ?? ''}" />
    <Parameter Name="MaxLength" Type="Integer" Parent="General Configuration" Editor="String" Title="Dígitos a comparar:" Default="10" />
    <Parameter Name="ReportCallEnabled" Type="Boolean" Parent="" Editor="String" Title="Registrar llamadas en ${name}" Default="True" />
  </Parameters>
  <Authentication Type="No" />
  <Scenarios>
    <Scenario Id="" Type="REST">
      <Request SkipIf="" Url="${u('action=lookup&amp;number=[Number]')}" MessagePasses="0" RequestEncoding="UrlEncoded" RequestType="Get" ResponseType="Json" />
      <Rules>
        <Rule Type="Any">contacts.id</Rule>
      </Rules>
      <Variables>${contactVars('contacts.')}
      </Variables>${outputs}
    </Scenario>
    <Scenario Id="SearchContacts" Type="REST">
      <Request SkipIf="" Url="${u('action=search&amp;q=[SearchText]')}" MessagePasses="0" RequestEncoding="UrlEncoded" RequestType="Get" ResponseType="Json" />
      <Rules>
        <Rule Type="Any">contacts.id</Rule>
      </Rules>
      <Variables>${contactVars('contacts.')}
      </Variables>${outputs}
    </Scenario>
    <Scenario Id="ReportCall" Type="REST">
      <Request SkipIf="[ReportCallEnabled]!=True" Url="${u('action=journal')}" MessagePasses="0" RequestContentType="application/json" RequestEncoding="Json" RequestType="Post" ResponseType="Json">
        <PostValues Key="">
          <Value Key="call_type" Passes="1" Type="String">[CallType]</Value>
          <Value Key="direction" Passes="1" Type="String">[CallDirection]</Value>
          <Value Key="number" Passes="1" Type="String">[Number]</Value>
          <Value Key="name" Passes="1" Type="String">[Name]</Value>
          <Value Key="agent" Passes="1" Type="String">[Agent]</Value>
          <Value Key="agent_email" Passes="1" Type="String">[AgentEmail]</Value>
          <Value Key="duration" Passes="1" Type="String">[Duration]</Value>
          <Value Key="date_time" Passes="1" Type="String">[DateTime]</Value>
          <Value Key="start_utc" Passes="1" Type="String">[CallStartTimeUTC]</Value>
          <Value Key="established_utc" Passes="1" Type="String">[CallEstablishedTimeUTC]</Value>
          <Value Key="end_utc" Passes="1" Type="String">[CallEndTimeUTC]</Value>
          <Value Key="queue" Passes="1" Type="String">[QueueExtension]</Value>
          <Value Key="entity_id" Passes="1" Type="String">[EntityId]</Value>
        </PostValues>
      </Request>
      <Rules>
        <Rule Type="Any">ok</Rule>
      </Rules>
      <Variables />
      <Outputs AllowEmpty="true" />
    </Scenario>
  </Scenarios>
</Crm>
`;
}
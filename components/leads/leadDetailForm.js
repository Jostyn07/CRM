'use client';

import { useState } from 'react';
import Input from '../ui/input';
import Button from '../ui/button';
import { normalizePhone } from '../../lib/validations/leads';

export default function LeadDetailForm({ lead, onSave, saving }) {
  const [name, setName] = useState(lead.name);
  const [phone, setPhone] = useState(lead.phone);
  const [address, setAddress] = useState(lead.address || '');
  const [email, setEmail] = useState(lead.email || '');
  const [phoneError, setPhoneError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();

    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length !== 10) {
      setPhoneError('El teléfono debe tener 10 dígitos (sin contar el +1)');
      return;
    }
    setPhoneError(null);

    onSave({
      name: name.trim(),
      phone: normalizedPhone,
      address: address.trim() || null,
      email: email.trim() || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '0.75rem' }}>
      <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <div>
        <Input label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        {phoneError && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: 4 }}>{phoneError}</p>
        )}
      </div>
      <Input label="Dirección (opcional)" value={address} onChange={(e) => setAddress(e.target.value)} />
      <Input
        label="Correo electrónico (opcional)"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" disabled={saving} style={{ justifySelf: 'start' }}>
        {saving ? 'Guardando…' : 'Guardar'}
      </Button>
    </form>
  );
}
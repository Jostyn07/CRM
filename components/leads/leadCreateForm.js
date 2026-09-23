'use client';

import { useState } from 'react';
import Input from '../ui/input';
import Button from '../ui/button';
import { normalizePhone } from '../../lib/validations/leads';

export default function LeadCreateForm({ onCreate, saving, errorMsg, isAdmin, users = [] }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [email, setEmail] = useState('');
  const [ownerId, setOwnerId] = useState(''); // '' = yo mismo
  const [phoneError, setPhoneError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();

    const normalizedPhone = normalizePhone(phone);
    if (normalizedPhone.length !== 10) {
      setPhoneError('El teléfono debe tener 10 dígitos (sin contar el +1)');
      return;
    }
    setPhoneError(null);

    onCreate(
      {
        name: name.trim(),
        phone: normalizedPhone,
        address: address.trim() || null,
        email: email.trim() || null,
        ...(isAdmin && ownerId ? { owner_id: ownerId } : {}),
      },
      () => {
        // limpia el formulario solo si la creación fue exitosa
        setName('');
        setPhone('');
        setAddress('');
        setEmail('');
        setOwnerId('');
      }
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '0.75rem' }}>
        {isAdmin && (
          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: '0.85rem', marginBottom: 4 }}>Propietario</span>
            <select className="input" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Yo mismo</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.full_name || u.id}</option>
              ))}
            </select>
          </label>
        )}
        <Input label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
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
      </div>

      {errorMsg && (
        <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{errorMsg}</p>
      )}

      <Button type="submit" disabled={saving}>
        {saving ? 'Creando…' : 'Crear lead'}
      </Button>
    </form>
  );
}
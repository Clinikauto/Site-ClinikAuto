const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }

  const { name, phone, email, service, datetime, message } = body || {};

  // Champs requis
  if (!name || !phone || !email || !service || !datetime) {
    return res.status(400).json({ error: 'Champs manquants: name, phone, email, service, datetime requis.' });
  }

  // Validation basique email / téléphone
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(String(email))) return res.status(400).json({ error: 'Email invalide' });

  const phoneNorm = String(phone).replace(/[^\d+]/g, '');
  if (phoneNorm.length < 6) return res.status(400).json({ error: 'Téléphone invalide' });

  // Sanitisation simple pour l'email/subject
  const safe = (s) => String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const booking = {
    id: `bk_${Date.now()}`,
    name: safe(name),
    phone: phoneNorm,
    email: safe(email),
    service: safe(service),
    datetime: safe(datetime),
    message: safe(message)
  };

  // Envoi d'email si SMTP configuré
  const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
  const SMTP_HOST = process.env.SMTP_HOST;

  let emailSent = false;
  if (NOTIFY_EMAIL && SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587,
        secure: process.env.SMTP_PORT === '465', // true pour 465
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      await transporter.sendMail({
        from: `"Clinik-Auto" <${process.env.SMTP_USER}>`,
        to: NOTIFY_EMAIL,
        subject: `Nouvelle réservation: ${booking.service} - ${booking.name}`,
        text: `Nouvelle réservation\n\n${JSON.stringify(booking, null, 2)}`
      });

      emailSent = true;
    } catch (err) {
      console.error('Erreur envoi email:', err);
      // On log l'erreur mais on ne casse pas la réponse — l'appelant sait que l'email n'a pas été envoyé
    }
  } else {
    console.warn('SMTP non configuré : SMTP_HOST/SMTP_USER/SMTP_PASS ou NOTIFY_EMAIL manquant.');
  }

  return res.status(200).json({ ok: true, booking, emailSent });
};
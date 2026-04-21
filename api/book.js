const nodemailer = require('nodemailer');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) {}
  }

  const { name, phone, email, service, datetime, message } = body || {};

  if (!name || !phone || !email || !service || !datetime) {
    return res.status(400).json({ error: 'Champs manquants: name, phone, email, service, datetime requis.' });
  }

  const booking = {
    id: `bk_${Date.now()}`,
    name, phone, email, service, datetime, message
  };

  const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
  const SMTP_HOST = process.env.SMTP_HOST;
  if (NOTIFY_EMAIL && SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      await transporter.sendMail({
        from: `"Clinik-Auto" <${process.env.SMTP_USER}>`,
        to: NOTIFY_EMAIL,
        subject: `Nouvelle réservation: ${booking.service} - ${booking.name}`,
        text: `Nouvelle réservation\n\n${JSON.stringify(booking, null, 2)}`
      });
    } catch (err) {
      console.error('Erreur envoi email:', err);
    }
  }

  return res.status(200).json({ ok: true, booking });
};
